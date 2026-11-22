import { parseHTML } from 'linkedom';
import BizError from '../error/biz-error.js';

const SKIP_TAGS = new Set(['STYLE', 'SCRIPT', 'NOSCRIPT', 'TITLE', 'SVG', 'MATH', 'CODE', 'PRE']);
const BLOCKED_SELECTORS = 'script,base,meta,link,iframe,frame,frameset,object,embed,template';
const MAX_NODES = 1500;
const MAX_TOTAL_CHARS = 45000;
const SPLIT_LIMIT = 5000;

function splitLongText(text) {
	if (text.length <= SPLIT_LIMIT) return [text];
	const parts = [];
	let current = '';
	for (const ch of text) {
		current += ch;
		if (current.length >= SPLIT_LIMIT) {
			parts.push(current);
			current = '';
		}
	}
	if (current) parts.push(current);
	return parts;
}

function isTranslatableSegment(raw) {
	const text = String(raw || '').trim();
	if (!text) return false;
	if (!/\p{L}/u.test(text)) return false;
	if (/^(?:https?:\/\/|mailto:)\S+$/i.test(text)) return false;
	if (/^\S+@\S+\.\S+$/.test(text)) return false;
	return true;
}

export function buildMailTranslationDocument(mail) {
	const rawSubject = String(mail.subject || '');
	const translateSubject = isTranslatableSegment(rawSubject);

	let document = null;
	if (mail.content) {
		const htmlSource = /<html[\s>]/i.test(mail.content)
			? mail.content
			: `<!doctype html><html><head></head><body>${mail.content}</body></html>`;
		({ document } = parseHTML(htmlSource));
		document.querySelectorAll(BLOCKED_SELECTORS).forEach(node => node.remove());
	}

	const nodes = [];

	function visit(node) {
		if (
			node.nodeType === 1 &&
			(SKIP_TAGS.has(node.tagName) ||
				node.getAttribute?.('translate') === 'no' ||
				node.classList?.contains('notranslate'))
		) {
			return;
		}
		if (node.nodeType === 3) {
			const data = node.data || '';
			const trimmed = data.trim();
			if (isTranslatableSegment(trimmed)) {
				nodes.push({
					node,
					text: trimmed,
					prefix: data.match(/^\s*/)[0],
					suffix: data.match(/\s*$/)[0],
				});
			}
			return;
		}
		for (const child of node.childNodes || []) {
			visit(child);
		}
	}

	if (document?.body) {
		visit(document.body);
	}

	const texts = [];
	let subjectIndex = -1;
	if (translateSubject) {
		subjectIndex = texts.length;
		texts.push(rawSubject.trim());
	}

	// HTML body with translatable DOM text nodes
	if (nodes.length > 0) {
		const totalChars = nodes.reduce((sum, item) => sum + item.text.length, 0);
		if (nodes.length > MAX_NODES || totalChars > MAX_TOTAL_CHARS) {
			throw new BizError('这封邮件正文过长，暂不支持全文翻译', 400);
		}
		for (const item of nodes) {
			item.start = texts.length;
			item.parts = splitLongText(item.text);
			texts.push(...item.parts);
		}
		return {
			texts,
			render(translated) {
				if (translated.length !== texts.length) {
					throw new BizError('邮件译文不完整，请重新翻译', 503);
				}
				const subject = subjectIndex >= 0 ? translated[subjectIndex] : rawSubject;
				for (const item of nodes) {
					const piece = translated.slice(item.start, item.start + item.parts.length).join('');
					item.node.data = item.prefix + piece + item.suffix;
				}
				return {
					subject,
					text: document.body.innerText || '',
					html: '<!doctype html>' + document.documentElement.outerHTML,
				};
			},
		};
	}

	// HTML body that only has images/tables without text nodes
	if (document?.body && (document.body.innerText?.trim() || document.body.querySelector('img,table'))) {
		return {
			texts,
			render(translated) {
				const subject = subjectIndex >= 0 && translated[subjectIndex] ? translated[subjectIndex] : rawSubject;
				return {
					subject,
					text: document.body.innerText || '',
					html: '<!doctype html>' + document.documentElement.outerHTML,
				};
			},
		};
	}

	// Plain-text only email
	const rawText = String(mail.text || '');
	if (rawText.length > MAX_TOTAL_CHARS) {
		throw new BizError('这封邮件正文过长，暂不支持全文翻译', 400);
	}
	const textStart = texts.length;
	const textParts = isTranslatableSegment(rawText) ? splitLongText(rawText) : [];
	texts.push(...textParts);

	return {
		texts,
		render(translated) {
			if (translated.length !== texts.length) {
				throw new BizError('邮件译文不完整，请重新翻译', 503);
			}
			const subject = subjectIndex >= 0 ? translated[subjectIndex] : rawSubject;
			const bodyText = textParts.length
				? translated.slice(textStart, textStart + textParts.length).join('')
				: rawText;
			return {
				subject,
				text: bodyText,
				html: '',
			};
		},
	};
}
