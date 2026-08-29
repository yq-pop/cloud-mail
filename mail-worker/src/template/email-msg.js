import emailUtils from '../utils/email-utils.js';

const TELEGRAM_MESSAGE_LIMIT = 3500;
const TRUNCATED_SUFFIX = '...';

function escapeHtml(text = '') {
	return String(text || '')
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

export default function emailMsgTemplate(email, tgMsgTo, tgMsgFrom, tgMsgText) {

	let template = `📬 <b>${escapeHtml(email.subject || '无主题')}</b>`;

	if (tgMsgFrom === 'only-name') {
		template += `\n\n👤 <b>发件人：</b>${escapeHtml(email.name || '')}`;
	} else if (tgMsgFrom === 'show') {
		const name = email.name ? `${escapeHtml(email.name)} ` : '';
		template += `\n\n👤 <b>发件人：</b>${name}&lt;${escapeHtml(email.sendEmail || '')}&gt;`;
	}

	if (tgMsgTo === 'show') {
		template += `\n📥 <b>收件人：</b>${escapeHtml(email.toEmail || '')}`;
	}

	const rawText = emailUtils.formatText(email.text) || emailUtils.htmlToText(email.content) || '';
	const text = escapeHtml(rawText.trim());

	if (tgMsgText === 'show' && text) {
		const prefix = `${template}\n\n<blockquote>💬 <b>邮件正文：</b>\n\n`;
		const suffix = `</blockquote>`;
		const maxTextLength = Math.max(0, TELEGRAM_MESSAGE_LIMIT - prefix.length - suffix.length);
		const truncated = truncateText(text, maxTextLength);
		template += `\n\n<blockquote>💬 <b>邮件正文：</b>\n\n${truncated}</blockquote>`;
	}

	return template;
}
