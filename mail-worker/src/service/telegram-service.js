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

const telegramService = {

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

	async sendEmailToBot(c, email) {

		const { tgBotToken, tgChatId, customDomain, tgMsgTo, tgMsgFrom, tgMsgText } = await settingService.query(c);

		const tgChatIds = tgChatId.split(',');

		const jwtToken = await jwtUtils.generateToken(c, { emailId: email.emailId });

		const rawText = tgMsgText === 'show'
			? (emailUtils.formatText(email.text) || emailUtils.htmlToText(email.content) || '')
			: '';

		let translated = null;
		try {
			translated = await translationService.translateTelegramSummary(email.subject || '', rawText, 'zh');
		} catch (e) {
			console.warn('Telegram 通知自动翻译失败，已自动降级为原文:', e.message);
		}

		const baseUrl = customDomain ? domainUtils.toOssDomain(customDomain) : '';
		const webAppUrl = baseUrl ? `${baseUrl}/api/telegram/getEmail/${jwtToken}` : 'https://www.cloudflare.com/404';
		const translatedWebAppUrl = baseUrl ? `${webAppUrl}?translate=1` : 'https://www.cloudflare.com/404';

		const actionRow = [
			{
				text: 'View',
				web_app: { url: webAppUrl }
			}
		];

		if (translated && baseUrl) {
			actionRow.push({
				text: '译文',
				web_app: { url: translatedWebAppUrl }
			});
		}

		const inlineKeyboard = [actionRow];

		if (email.code) {
			inlineKeyboard.push([
				{
					text: email.code,
					copy_text: { text: email.code }
				}
			]);
		}

		const msgText = emailMsgTemplate(email, tgMsgTo, tgMsgFrom, tgMsgText, translated);

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
