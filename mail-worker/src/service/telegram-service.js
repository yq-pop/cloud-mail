import orm from '../entity/orm';
import email from '../entity/email';
import settingService from './setting-service';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
import { eq } from 'drizzle-orm';
import jwtUtils from '../utils/jwt-utils';
import emailMsgTemplate from '../template/email-msg';
import emailTextTemplate from '../template/email-text';
import emailHtmlTemplate, { sanitizeTelegramHtml } from '../template/email-html';
import domainUtils from '../utils/domain-uitls';
import proxyService from './proxy-service';
import emailUtils from '../utils/email-utils';
import translationService from './translation-service';
import BizError from '../error/biz-error';

const TG_WEBHOOK_CACHE_KEY = 'tg_webhook_registered:v1';
const TG_WEBHOOK_CACHE_TTL = 60 * 60 * 24; // 24 hours
const encoder = new TextEncoder();

async function deriveWebhookSecret(jwtSecret) {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`tg-webhook:${jwtSecret || ''}`));
	return [...new Uint8Array(digest)]
		.slice(0, 24)
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
}

async function hashShort(input) {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(input || '')));
	return [...new Uint8Array(digest)]
		.slice(0, 12)
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
}

const telegramService = {

	buildInlineKeyboard(emailRow, webAppUrl, mode = 'orig') {
		const isTranslated = mode === 'zh';
		const inlineKeyboard = [
			[
				{
					text: 'View',
					web_app: { url: webAppUrl }
				}
			],
			[
				{
					text: isTranslated ? '查看原文' : '翻译',
					callback_data: isTranslated
						? `tg_orig:${emailRow.emailId}`
						: `tg_tr:${emailRow.emailId}`
				}
			]
		];

		if (emailRow.code) {
			inlineKeyboard.push([
				{
					text: emailRow.code,
					copy_text: { text: emailRow.code }
				}
			]);
		}

		return inlineKeyboard;
	},

	async ensureWebhook(c, { tgBotToken, customDomain, force = false } = {}) {
		if (!tgBotToken || !customDomain || !c.env?.jwt_secret) {
			return false;
		}
		const baseUrl = domainUtils.toOssDomain(customDomain);
		if (!baseUrl) return false;

		const webhookUrl = `${baseUrl}/api/telegram/webhook`;
		const fingerprint = await hashShort(`${tgBotToken}|${webhookUrl}`);

		if (!force) {
			try {
				const cached = await c.env.kv.get(TG_WEBHOOK_CACHE_KEY);
				if (cached === fingerprint) {
					return true;
				}
			} catch (e) {
				console.warn('读取 Telegram Webhook 缓存失败:', e.message);
			}
		}

		try {
			const secretToken = await deriveWebhookSecret(c.env.jwt_secret);
			const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/setWebhook`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					url: webhookUrl,
					secret_token: secretToken,
					allowed_updates: ['callback_query']
				})
			});
			const data = await res.json().catch(() => ({}));
			if (res.ok && data?.ok) {
				await c.env.kv.put(TG_WEBHOOK_CACHE_KEY, fingerprint, { expirationTtl: TG_WEBHOOK_CACHE_TTL });
				return true;
			}
			console.error('注册 Telegram Webhook 失败:', res.status, JSON.stringify(data));
			return false;
		} catch (e) {
			console.error('注册 Telegram Webhook 异常:', e.message);
			return false;
		}
	},

	async answerCallbackQuery(tgBotToken, callbackQueryId, text = '', showAlert = false) {
		if (!tgBotToken || !callbackQueryId) return;
		try {
			await fetch(`https://api.telegram.org/bot${tgBotToken}/answerCallbackQuery`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					callback_query_id: callbackQueryId,
					text,
					show_alert: showAlert
				})
			});
		} catch (e) {
			console.warn('answerCallbackQuery 失败:', e.message);
		}
	},

	async editBotMessage(tgBotToken, chatId, messageId, text, inlineKeyboard) {
		const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/editMessageText`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				chat_id: chatId,
				message_id: messageId,
				parse_mode: 'HTML',
				text,
				reply_markup: {
					inline_keyboard: inlineKeyboard
				}
			})
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			const desc = String(data?.description || '');
			if (desc.includes('message is not modified')) {
				return { ok: true, notModified: true };
			}
			console.error(`编辑 Telegram 消息失败 status: ${res.status} response: ${JSON.stringify(data)}`);
			return { ok: false, description: desc };
		}
		return { ok: true };
	},

	async handleWebhook(c, update, secretHeader) {
		const expectedSecret = await deriveWebhookSecret(c.env.jwt_secret);
		if (!secretHeader || secretHeader !== expectedSecret) {
			throw new BizError('Forbidden', 403);
		}

		const callbackQuery = update?.callback_query;
		if (!callbackQuery) {
			return { ok: true };
		}

		const { tgBotToken, tgChatId, customDomain, tgMsgTo, tgMsgFrom, tgMsgText } = await settingService.query(c);
		if (!tgBotToken) {
			return { ok: true };
		}

		const callbackId = callbackQuery.id;
		const dataStr = String(callbackQuery.data || '');
		const match = dataStr.match(/^tg_(tr|orig):(\d+)$/);
		if (!match) {
			await this.answerCallbackQuery(tgBotToken, callbackId);
			return { ok: true };
		}

		const chatId = callbackQuery.message?.chat?.id;
		const messageId = callbackQuery.message?.message_id;
		if (chatId == null || messageId == null) {
			await this.answerCallbackQuery(tgBotToken, callbackId, '无法定位消息');
			return { ok: true };
		}

		const allowedChatIds = String(tgChatId || '')
			.split(',')
			.map(id => id.trim())
			.filter(Boolean);
		if (allowedChatIds.length > 0 && !allowedChatIds.includes(String(chatId))) {
			await this.answerCallbackQuery(tgBotToken, callbackId, '无权操作该消息', true);
			return { ok: true };
		}

		const action = match[1];
		const emailId = Number(match[2]);
		const emailRow = await orm(c).select().from(email).where(eq(email.emailId, emailId)).get();
		if (!emailRow) {
			await this.answerCallbackQuery(tgBotToken, callbackId, '邮件不存在或已被删除', true);
			return { ok: true };
		}

		const jwtToken = await jwtUtils.generateToken(c, { emailId: emailRow.emailId });
		const baseUrl = customDomain ? domainUtils.toOssDomain(customDomain) : '';
		const webAppUrl = baseUrl ? `${baseUrl}/api/telegram/getEmail/${jwtToken}` : 'https://www.cloudflare.com/404';

		if (action === 'orig') {
			const origText = emailMsgTemplate(emailRow, tgMsgTo, tgMsgFrom, tgMsgText, null);
			const keyboard = this.buildInlineKeyboard(emailRow, webAppUrl, 'orig');
			const editRes = await this.editBotMessage(tgBotToken, chatId, messageId, origText, keyboard);
			await this.answerCallbackQuery(
				tgBotToken,
				callbackId,
				editRes.ok ? '已切换为原文' : '切换失败，请重试'
			);
			return { ok: true };
		}

		try {
			const rawText = tgMsgText === 'show'
				? (emailUtils.formatText(emailRow.text) || emailUtils.htmlToText(emailRow.content) || '')
				: '';
			const translated = await translationService.translateTelegramMessage(c, emailRow, rawText, 'zh');
			const translatedMsg = emailMsgTemplate(emailRow, tgMsgTo, tgMsgFrom, tgMsgText, translated);
			const keyboard = this.buildInlineKeyboard(emailRow, webAppUrl, 'zh');
			const editRes = await this.editBotMessage(tgBotToken, chatId, messageId, translatedMsg, keyboard);
			await this.answerCallbackQuery(
				tgBotToken,
				callbackId,
				editRes.ok ? '已翻译为简体中文' : '消息更新失败，请重试'
			);
		} catch (e) {
			console.error('Telegram 原地翻译失败:', e.message);
			await this.answerCallbackQuery(tgBotToken, callbackId, e?.message || '翻译失败，请稍后重试', true);
		}

		return { ok: true };
	},

	async getEmailContent(c, params, query = {}) {

		const { token } = params;

		const result = await jwtUtils.verifyToken(c, token);

		if (!result || !result.emailId) {
			return emailTextTemplate('Access denied');
		}

		const emailRow = await orm(c).select().from(email).where(eq(email.emailId, result.emailId)).get();

		if (emailRow) {
			const autoTranslate = query?.translate === '1' || query?.translate === 'true';
			const templateOptions = {
				token,
				subject: emailRow.subject || '',
				autoTranslate,
			};

			if (emailRow.content) {
				// Telegram 网页预览：外链图改成 /proxy?url=，避免暴露打开者 IP。
				const html = await proxyService.rewriteHtml(c, emailRow.content);
				return emailHtmlTemplate(html || '', templateOptions);
			} else {
				return emailTextTemplate(emailRow.text || '', templateOptions);
			}

		} else {
			return emailTextTemplate('The email does not exist');
		}

	},

	async translateEmailByToken(c, token, target = 'zh') {
		const result = await jwtUtils.verifyToken(c, token);
		if (!result || !result.emailId) {
			throw new BizError('Access denied', 401);
		}

		const mailRow = await orm(c)
			.select({
				emailId: email.emailId,
				userId: email.userId,
				subject: email.subject,
				content: email.content,
				text: email.text,
			})
			.from(email)
			.where(eq(email.emailId, result.emailId))
			.get();

		if (!mailRow) {
			throw new BizError('邮件不存在', 404);
		}

		const data = await translationService.translateEmailRow(c, mailRow, target, {
			rateKeyId: `tg:${mailRow.emailId}`,
		});

		return {
			...data,
			html: data.html ? sanitizeTelegramHtml(data.html) : '',
		};
	},

	async sendEmailToBot(c, emailRow) {

		const { tgBotToken, tgChatId, customDomain, tgMsgTo, tgMsgFrom, tgMsgText } = await settingService.query(c);

		const tgChatIds = tgChatId.split(',');

		await this.ensureWebhook(c, { tgBotToken, customDomain });

		const jwtToken = await jwtUtils.generateToken(c, { emailId: emailRow.emailId });

		const baseUrl = customDomain ? domainUtils.toOssDomain(customDomain) : '';
		const webAppUrl = baseUrl ? `${baseUrl}/api/telegram/getEmail/${jwtToken}` : 'https://www.cloudflare.com/404';
		const inlineKeyboard = this.buildInlineKeyboard(emailRow, webAppUrl, 'orig');
		const msgText = emailMsgTemplate(emailRow, tgMsgTo, tgMsgFrom, tgMsgText, null);

		await Promise.all(tgChatIds.map(async chatId => {
			try {
				const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						chat_id: chatId,
						parse_mode: 'HTML',
						text: msgText,
						reply_markup: {
							inline_keyboard: inlineKeyboard
						}
					})
				});
				if (!res.ok) {
					console.error(`转发 Telegram 失败 status: ${res.status} response: ${await res.text()}`);
				}
			} catch (e) {
				console.error(`转发 Telegram 失败:`, e.message);
			}
		}));

	}

};

export default telegramService;
