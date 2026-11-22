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

async function sha256Short(input) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return [...new Uint8Array(digest)]
		.slice(0, 12)
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
}

const translationService = {
	async canAccessEmail(c, mailRow, userId) {
		if (!mailRow) return false;
		if (mailRow.userId === userId) return true;
		const caller = c.get('user');
		if (caller?.email && caller.email === c.env.admin) return true;
		const permKeys = await permService.userPermKeys(c, userId);
		return permKeys.includes('all-email:query');
	},

	async checkRateLimit(c, userId) {
		const minuteBucket = Math.floor(Date.now() / 60000);
		const key = `${RATE_PREFIX}${userId}:${minuteBucket}`;
		const current = Number(await c.env.kv.get(key)) || 0;
		if (current >= RATE_LIMIT_PER_MIN) {
			throw new BizError('翻译请求过于频繁，请稍后再试', 429);
		}
		await c.env.kv.put(key, String(current + 1), { expirationTtl: 120 });
	},

	async translateMail(c, params, userId) {
		const emailId = Number(params?.emailId);
		if (!Number.isSafeInteger(emailId) || emailId <= 0) {
			throw new BizError('邮件不存在', 404);
		}

		const language = resolveTargetLanguage(params?.target || 'zh');
		if (!language) {
			throw new BizError('不支持的目标语言', 400);
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

		await this.checkRateLimit(c, userId);

		const { texts: translatedTexts, detectedLanguage } = await translationProvider.translate(
			doc.texts,
			language.serviceId
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
};

export default translationService;
