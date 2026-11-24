import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';

const ANTI_PHISHING_STOPWORDS = new Set([
	'is', 'are', 'was', 'were', 'has', 'have', 'not', 'no', 'none', 'set', 'unset',
	'to', 'for', 'of', 'in', 'on', 'the', 'a', 'an', 'if', 'you', 'your', 'code', 'please'
]);

const ANTI_PHISHING_PATTERN = /(?:(?:安全)?(?:防钓鱼码|反钓鱼码)|anti[-\s]?phishing(?:\s+code)?)(?:[ \t]*(?:为|是|is)?[ \t]*(?:(?::|：)\s*|[ \t]*|\r?\n[ \t]*))([A-Za-z0-9_-]{1,32})/gi;

const aiService = {
	async extractCode(c, email, options = {}) {
		if (!this.shouldExtractCode(options.aiCode, options.aiCodeFilter, email)) {
			return '';
		}

		const ai = c.env.ai;

		try {
			const subject = email.subject || '';
			const text = emailUtils.formatText(email.text || '');
			const htmlText = emailUtils.htmlToText(email.html || '');
			const body = (htmlText || text).slice(0, 6000);

			if (!subject && !body) {
				return '';
			}

			const { text: sanitizedSubject, antiPhishingCodes: subjectAntiPhishingCodes } = this.stripAntiPhishingCodes(subject);
			const { text: sanitizedBody, antiPhishingCodes: bodyAntiPhishingCodes } = this.stripAntiPhishingCodes(body);
			const antiPhishingCodes = new Set([...subjectAntiPhishingCodes, ...bodyAntiPhishingCodes]);

			if (!sanitizedSubject && !sanitizedBody) {
				return '';
			}

			const result = await ai.run(c.env.ai_model || '@cf/meta/llama-3.1-8b-instruct-fast', {
				messages: [
					{
						role: 'system',
						content: 'You extract one-time verification codes (OTP/security/confirmation codes) from emails. Return only JSON like {"code":"12345678"} or {"code":""}. Rules: 1) The code must be 8 characters or fewer and must not contain spaces. 2) Ignore anti-phishing codes (防钓鱼码 / anti-phishing code), login or security alert notifications without an OTP, account IDs, usernames, order/tracking numbers, and invite/promo codes. 3) If there is no verification code, return {"code":""}. Do not explain.'
					},
					{
						role: 'user',
						content: `Subject: ${sanitizedSubject}\n\n${sanitizedBody}`
					}
				],
				temperature: 0,
				max_tokens: 32
			});

			const content = typeof result === 'string' ? result : result?.response || '';
			const code = this.parseCodeResponse(content);
			if (!code) {
				return '';
			}

			if (code.length > 8 || /\s/.test(code)) {
				return '';
			}

			if (antiPhishingCodes.has(code.toLowerCase()) && !this.containsToken(`${sanitizedSubject}\n${sanitizedBody}`, code)) {
				return '';
			}

			return code;
		} catch (e) {
			console.error('验证码提取失败: ', e);
			return '';
		}
	},

	stripAntiPhishingCodes(text) {
		const antiPhishingCodes = new Set();
		if (!text) {
			return { text: '', antiPhishingCodes };
		}

		const sanitized = text.replace(ANTI_PHISHING_PATTERN, (fullMatch, token) => {
			if (!token || ANTI_PHISHING_STOPWORDS.has(token.toLowerCase())) {
				return fullMatch;
			}
			antiPhishingCodes.add(token.toLowerCase());
			return '';
		});

		return { text: sanitized.trim(), antiPhishingCodes };
	},

	parseCodeResponse(content) {
		if (!content) {
			return '';
		}
		if (typeof content === 'object') {
			return typeof content.code === 'string' ? content.code.trim() : '';
		}
		const trimmed = String(content).trim();
		try {
			const json = JSON.parse(trimmed);
			return typeof json?.code === 'string' ? json.code.trim() : '';
		} catch {
			const matches = trimmed.match(/\{[^{}]*\}/g) || [];
			for (let i = matches.length - 1; i >= 0; i--) {
				try {
					const json = JSON.parse(matches[i]);
					if (typeof json?.code === 'string') {
						return json.code.trim();
					}
				} catch {
					continue;
				}
			}
			return '';
		}
	},

	containsToken(text, token) {
		if (!text || !token) {
			return false;
		}
		const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`, 'i');
		return pattern.test(text);
	},

	shouldExtractCode(aiCode, aiCodeFilterStr, email) {
		if (aiCode !== settingConst.aiCode.OPEN) {
			return false;
		}

		const filterList = aiCodeFilterStr ? aiCodeFilterStr.split(',').map(item => item.trim().toLowerCase()).filter(Boolean) : [];

		if (filterList.length === 0) {
			return true;
		}

		const fromEmail = (email.from?.address || '').trim().toLowerCase();
		const fromDomain = emailUtils.getDomain(fromEmail).toLowerCase();

		return filterList.some(item => item === fromEmail || item === fromDomain);
	}
};

export default aiService;
