import BizError from '../error/biz-error.js';

export const TRANSLATION_LANGUAGES = Object.freeze([
	{ id: 'zh',    serviceId: 'zh-Hans' },
	{ id: 'zh-TW', serviceId: 'zh-Hant' },
	{ id: 'en',    serviceId: 'en' },
	{ id: 'ja',    serviceId: 'ja' },
	{ id: 'ko',    serviceId: 'ko' },
	{ id: 'fr',    serviceId: 'fr' },
	{ id: 'de',    serviceId: 'de' },
	{ id: 'es',    serviceId: 'es' },
	{ id: 'ru',    serviceId: 'ru' },
	{ id: 'pt',    serviceId: 'pt' },
]);

const LANG_MAP = new Map(TRANSLATION_LANGUAGES.map(item => [item.id, item]));

export function resolveTargetLanguage(code) {
	const key = String(code || 'zh').trim();
	if (key === 'zh-Hans' || key === 'zh-CN') return LANG_MAP.get('zh');
	if (key === 'zh-Hant') return LANG_MAP.get('zh-TW');
	return LANG_MAP.get(key) || null;
}

const EDGE_ENDPOINT = 'https://edge.microsoft.com/translate/translatetext';
const EDGE_UA = 'Mozilla/5.0 Edg/130.0.0.0';
const MAX_CHUNK_ITEMS = 60;
const MAX_CHUNK_CHARS = 12000;
const REQUEST_TIMEOUT_MS = 20000;

// Edge channel used by translate.js (MIT, xnx3) & PastKing/xi-mail.
// Only explicit text arrays are sent; no cookies or user identifiers.
const translationProvider = {
	async translate(texts, targetServiceId, source = 'auto') {
		if (!Array.isArray(texts) || texts.length === 0) {
			return { texts: [], detectedLanguage: '' };
		}

		const chunks = [];
		let chunk = [];
		let length = 0;

		for (const text of texts) {
			if (typeof text !== 'string' || text.length > MAX_CHUNK_CHARS) {
				throw new BizError('翻译文本过长，请分段处理', 400);
			}
			if (chunk.length && (length + text.length > MAX_CHUNK_CHARS || chunk.length >= MAX_CHUNK_ITEMS)) {
				chunks.push(chunk);
				chunk = [];
				length = 0;
			}
			chunk.push(text);
			length += text.length;
		}
		if (chunk.length) {
			chunks.push(chunk);
		}

		const translated = [];
		let detectedLanguage = '';

		for (const values of chunks) {
			let response;
			let result;
			try {
				const url = new URL(EDGE_ENDPOINT);
				const params = new URLSearchParams({
					to: targetServiceId,
					isEnterpriseClient: 'false',
				});
				if (source && source !== 'auto') {
					params.set('from', source);
				}
				url.search = params.toString();

				response = await fetch(url, {
					method: 'POST',
					redirect: 'manual',
					headers: {
						'Content-Type': 'application/json',
						'User-Agent': EDGE_UA,
					},
					body: JSON.stringify(values),
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				});

				if (!response.ok) {
					throw new BizError(`翻译服务请求失败（HTTP ${response.status}），请稍后重试`, 503);
				}
				result = await response.json();
			} catch (error) {
				if (error instanceof BizError) throw error;
				throw new BizError('翻译服务暂时不可用，请稍后重试', 503);
			}

			if (
				!Array.isArray(result) ||
				result.length !== values.length ||
				result.some(item => typeof item?.translations?.[0]?.text !== 'string')
			) {
				throw new BizError('翻译服务返回结果不完整，请稍后重试', 503);
			}

			if (!detectedLanguage) {
				const firstDetected = result.find(item => item?.detectedLanguage?.language)?.detectedLanguage?.language;
				if (firstDetected) detectedLanguage = firstDetected;
			}

			translated.push(...result.map(item => item.translations[0].text));
		}

		return { texts: translated, detectedLanguage };
	},
};

export default translationProvider;
