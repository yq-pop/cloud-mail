import emailUtils from '../utils/email-utils';

const TELEGRAM_MESSAGE_LIMIT = 3500;
const TRUNCATED_SUFFIX = '...';

function escapeHtml(text = '') {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function truncateText(text, maxLength) {
	if (!text || text.length <= maxLength) {
		return text || '';
	}

	if (maxLength <= TRUNCATED_SUFFIX.length) {
		return TRUNCATED_SUFFIX.slice(0, maxLength);
	}

	return text.slice(0, maxLength - TRUNCATED_SUFFIX.length) + TRUNCATED_SUFFIX;
}

export default function emailMsgTemplate(email, tgMsgTo, tgMsgFrom, tgMsgText, translated = null) {
	const rawSubject = String(email.subject || '').trim();
	const translatedSubject = String(translated?.subject || '').trim();
	const hasTranslatedSubject = Boolean(translatedSubject && translatedSubject !== rawSubject);

	let template = hasTranslatedSubject
		? `<b>${escapeHtml(translatedSubject)}</b>\n<i>${escapeHtml(rawSubject)}</i>`
		: `<b>${escapeHtml(rawSubject)}</b>`;

	if (tgMsgFrom === 'only-name') {
		template += `\n\nFrom\u200B：${escapeHtml(email.name || '')}`;
	}

	if (tgMsgFrom === 'show') {
		template += `\n\nFrom\u200B：${escapeHtml(email.name || '')}  &lt;${escapeHtml(email.sendEmail || '')}&gt;`;
	}

	if (tgMsgTo === 'show' && tgMsgFrom === 'hide') {
		template += `\n\nTo：\u200B${escapeHtml(email.toEmail || '')}`;
	} else if (tgMsgTo === 'show') {
		template += `\nTo：\u200B${escapeHtml(email.toEmail || '')}`;
	}

	if (tgMsgText === 'show') {
		const rawText = emailUtils.formatText(email.text) || emailUtils.htmlToText(email.content) || '';
		const translatedText = String(translated?.text || '').trim();
		const hasTranslatedText = Boolean(translatedText && translatedText !== rawText.trim());

		if (hasTranslatedText) {
			const zhHeader = '\n\n';
			const quoteOverhead = '\n\n<blockquote expandable>原文：\n</blockquote>'.length;
			const remaining = Math.max(0, TELEGRAM_MESSAGE_LIMIT - template.length - zhHeader.length);

			// 优先保障中文译文完整展示，剩余空间放折叠原文（Telegram expandable blockquote）
			const escapedZh = escapeHtml(translatedText);
			const escapedOrig = escapeHtml(rawText);

			if (escapedZh.length + quoteOverhead + 80 <= remaining) {
				const maxOrigLen = Math.max(0, remaining - escapedZh.length - quoteOverhead);
				const shownOrig = truncateText(escapedOrig, maxOrigLen);
				template += `${zhHeader}${escapedZh}\n\n<blockquote expandable>原文：\n${shownOrig}</blockquote>`;
			} else {
				template += `${zhHeader}${truncateText(escapedZh, remaining)}`;
			}
		} else {
			const escapedText = escapeHtml(rawText);
			const prefix = `${template}\n\n`;
			const maxTextLength = Math.max(0, TELEGRAM_MESSAGE_LIMIT - prefix.length);
			template += `\n\n${truncateText(escapedText, maxTextLength)}`;
		}
	}

	return template;
}
