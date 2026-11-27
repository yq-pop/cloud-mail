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
	const useTranslated = Boolean(translated);

	const subjectDisplay = useTranslated && translatedSubject ? translatedSubject : rawSubject;
	let template = `<b>${escapeHtml(subjectDisplay)}</b>`;

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
		const bodyDisplay = useTranslated ? String(translated?.text || rawText) : rawText;
		const escapedText = escapeHtml(bodyDisplay);
		const prefix = `${template}\n\n`;
		const maxTextLength = Math.max(0, TELEGRAM_MESSAGE_LIMIT - prefix.length);
		template += `\n\n${truncateText(escapedText, maxTextLength)}`;
	}

	return template;
}
