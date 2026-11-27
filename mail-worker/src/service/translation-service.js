import { eq } from 'drizzle-orm';
import orm from '../entity/orm';
import email from '../entity/email';
import BizError from '../error/biz-error';
import permService from './perm-service';
import proxyService from './proxy-service';
import translationProvider, { resolveTargetLanguage } from './translation-provider';
import { buildMailTranslationDocument } from './mail-translation-document';

const CACHE_PREFIX = 'mail_translate:v1:';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const RATE_PREFIX = 'mail_translate_rate:';
const RATE_LIMIT_PER_MIN = 30;
const TG_AUTO_TRANSLATE_TIMEOUT_MS = 6000;
const TG_AUTO_TEXT_LIMIT = 2200;

async function sha256Short(input) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return [...new Uint8Array(digest)]
		.slice(0, 12)
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
}

function stripHtmlForDetect(html) {
	if (!html) return '';
	return String(html)
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&[a-z#0-9]+;/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function shouldAutoTranslateToZh(subject, text, html) {
	const sample = `${subject || ''} ${text || stripHtmlForDetect(html)}`.slice(0, 2000);
	if (!sample.trim()) return false;
	const cleaned = sample
		.replace(/https?:\/\/\S+/gi, ' ')
		.replace(/\S+@\S+\.\S+/g, ' ');
	const zhCount = (cleaned.match(/[\u4e00-\u9fff]/g) || []).length;
	const latinCount = (cleaned.match(/[A-Za-zÀ-ÿ]/g) || []).length;
	const otherForeignCount = (cleaned.match(/[\u0400-\u04ff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
	const foreign = latinCount + otherForeignCount;
	return foreign >= 14 && zhCount / (zhCount + foreign) < 0.25;
}

const translationService = {
	shouldAutoTranslateToZh,

	async canAccessEmail(c, mailRow, userId) {
		if (!mailRow) return false;
		if (mailRow.userId === userId) return true;
		const caller = c.get('user');
		if (caller?.email && caller.email === c.env.admin) return true;
		const permKeys = await permService.userPermKeys(c, userId);
		return permKeys.includes('all-email:query');
	},

	async checkRateLimit(c, rateKeyId) {
		const minuteBucket = Math.floor(Date.now() / 60000);
		const key = `${RATE_PREFIX}${rateKeyId}:${minuteBucket}`;
		const current = Number(await c.env.kv.get(key)) || 0;
		if (current >= RATE_LIMIT_PER_MIN) {
			throw new BizError('翻译请求过于频繁，请稍后再试', 429);
		}
		await c.env.kv.put(key, String(current + 1), { expirationTtl: 120 });
	},

	async translateEmailRow(c, mailRow, target = 'zh', options = {}) {
		const language = resolveTargetLanguage(target || 'zh');
		if (!language) {
			throw new BizError('不支持的目标语言', 400);
		}

		const emailId = mailRow.emailId;
		const sourceHash = await sha256Short(`${mailRow.subject || ''}\n---\n${mailRow.content || mailRow.text || ''}`);
		const cacheKey = `${CACHE_PREFIX}${emailId}:${language.id}:${sourceHash}`;

		const cached = await c.env.kv.get(cacheKey, { type: 'json' });
		if (cached && typeof cached.subject === 'string') {
			const html = cached.html ? await proxyService.rewriteHtml(c, cached.html) : '';
			return {
				emailId,
				target: language.id,
				detectedLanguage: cached.detectedLanguage || '',
				subject: cached.subject,
				html,
				text: cached.text || '',
				cached: true,
			};
		}

		const doc = buildMailTranslationDocument(mailRow);
		if (!doc.texts.length) {
			const rendered = doc.render([]);
			const html = rendered.html ? await proxyService.rewriteHtml(c, rendered.html) : '';
			return {
				emailId,
				target: language.id,
				detectedLanguage: '',
				subject: rendered.subject,
				html,
				text: rendered.text,
				cached: false,
			};
		}

		if (options.rateKeyId != null) {
			await this.checkRateLimit(c, options.rateKeyId);
		}

		const { texts: translatedTexts, detectedLanguage } = await translationProvider.translate(
			doc.texts,
			language.serviceId,
			'auto',
			options.timeoutMs ? { timeoutMs: options.timeoutMs } : undefined
		);
		const rendered = doc.render(translatedTexts);

		// Cache raw translated HTML (before time-limited signed /proxy image URLs)
		await c.env.kv.put(
			cacheKey,
			JSON.stringify({
				subject: rendered.subject,
				html: rendered.html || '',
				text: rendered.text || '',
				detectedLanguage,
			}),
			{ expirationTtl: CACHE_TTL_SECONDS }
		);

		const html = rendered.html ? await proxyService.rewriteHtml(c, rendered.html) : '';
		return {
			emailId,
			target: language.id,
			detectedLanguage,
			subject: rendered.subject,
			html,
			text: rendered.text,
			cached: false,
		};
	},

	async translateTelegramSummary(subject, text, target = 'zh') {
		const language = resolveTargetLanguage(target || 'zh');
		if (!language) return null;

		const rawSubject = String(subject || '').trim();
		const rawText = String(text || '').trim().slice(0, TG_AUTO_TEXT_LIMIT);
		if (!shouldAutoTranslateToZh(rawSubject, rawText, '')) {
			return null;
		}

		const values = [];
		let subjectIdx = -1;
		let textIdx = -1;
		if (rawSubject && /\p{L}/u.test(rawSubject)) {
			subjectIdx = values.length;
			values.push(rawSubject);
		}
		if (rawText && /\p{L}/u.test(rawText)) {
			textIdx = values.length;
			values.push(rawText);
		}
		if (!values.length) return null;

		const { texts: translatedTexts, detectedLanguage } = await translationProvider.translate(
			values,
			language.serviceId,
			'auto',
			{ timeoutMs: TG_AUTO_TRANSLATE_TIMEOUT_MS }
		);

		const translatedSubject = subjectIdx >= 0 ? translatedTexts[subjectIdx] : rawSubject;
		const translatedText = textIdx >= 0 ? translatedTexts[textIdx] : '';

		if (
			(!translatedSubject || translatedSubject.trim() === rawSubject) &&
			(!translatedText || translatedText.trim() === rawText)
		) {
			return null;
		}

		return {
			subject: translatedSubject || rawSubject,
			text: translatedText,
			detectedLanguage,
		};
	},

	async translateMail(c, params, userId) {
		const emailId = Number(params?.emailId);
		if (!Number.isSafeInteger(emailId) || emailId <= 0) {
			throw new BizError('邮件不存在', 404);
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
			.where(eq(email.emailId, emailId))
			.get();

		if (!(await this.canAccessEmail(c, mailRow, userId))) {
			throw new BizError('邮件不存在或无权限访问', 404);
		}

		return this.translateEmailRow(c, mailRow, params?.target || 'zh', { rateKeyId: userId });
	},
};

export default translationService;
