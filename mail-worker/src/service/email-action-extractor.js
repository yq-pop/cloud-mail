import { parseHTML } from 'linkedom';
import domainUtils from '../utils/domain-uitls.js';

const PUBLIC_EMAIL_DOMAINS = new Set([
	'gmail.com', 'googlemail.com', 'qq.com', '163.com', '126.com', 'yeah.net',
	'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'foxmail.com',
	'sina.com', 'sina.cn', 'sohu.com', 'aliyun.com', '139.com', '189.cn',
	'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'zoho.com', 'mail.ru'
]);

function cleanText(text = '') {
	return text.replace(/\s+/g, ' ').trim();
}

function truncateLabel(text = '', maxLen = 22) {
	const cleaned = cleanText(text);
	if (!cleaned) return '';
	if (cleaned.length <= maxLen) return cleaned;
	return cleaned.slice(0, maxLen - 1) + '…';
}

function getSenderDomain(email = '') {
	if (!email || typeof email !== 'string') return '';
	const parts = email.split('@');
	return parts.length === 2 ? parts[1].toLowerCase().trim() : '';
}

function getBrandName(name = '', domain = '') {
	if (name && name.trim()) {
		const cleanName = name.replace(/[<>"'()]/g, '').trim();
		if (cleanName.length <= 15) return cleanName;
		const firstWord = cleanName.split(/[\s,，-]/)[0];
		if (firstWord && firstWord.length >= 2 && firstWord.length <= 15) {
			return firstWord;
		}
	}
	if (domain) {
		const hostParts = domain.split('.');
		if (hostParts.length >= 2) {
			const sld = hostParts[hostParts.length - 2];
			return sld.charAt(0).toUpperCase() + sld.slice(1);
		}
	}
	return '';
}

export function extractEmailActions(html, email = {}, webAppUrl = '') {
	const buttons = [];
	const seenUrls = new Set();

	if (webAppUrl) {
		seenUrls.add(webAppUrl);
	}

	const senderDomain = getSenderDomain(email.sendEmail);
	const brandName = getBrandName(email.name, senderDomain);

	let primaryAction = null;
	const secondaryActions = [];
	let loginAction = null;

	// Extract ticket ID from subject if any
	let subjectTicketId = '';
	if (email.subject) {
		const ticketMatch = email.subject.match(/#(\d{4,10})|Ticket\s*(?:ID)?\s*[:#]?\s*(\d{4,10})/i);
		if (ticketMatch) {
			subjectTicketId = ticketMatch[1] || ticketMatch[2];
		}
	}

	if (html) {
		try {
			const { document } = parseHTML(html.includes('<body') ? html : `<body>${html}</body>`);
			const links = document.querySelectorAll('a[href]');

			for (const link of links) {
				const rawHref = (link.getAttribute('href') || '').trim();
				if (!rawHref.startsWith('http://') && !rawHref.startsWith('https://')) {
					continue;
				}

				if (seenUrls.has(rawHref)) continue;

				const linkText = cleanText(link.textContent || link.getAttribute('title') || '');
				const lowerHref = rawHref.toLowerCase();
				const lowerText = linkText.toLowerCase();

				// Filter out unsubscribe / tracker / static asset links
				if (
					lowerHref.includes('unsubscribe') ||
					lowerText.includes('unsubscribe') ||
					lowerText.includes('退订') ||
					lowerText.includes('opt out') ||
					lowerHref.includes('privacy') ||
					lowerText.includes('privacy policy') ||
					lowerText.includes('terms') ||
					lowerHref.endsWith('.png') ||
					lowerHref.endsWith('.jpg') ||
					lowerHref.endsWith('.gif') ||
					lowerHref.endsWith('.css')
				) {
					continue;
				}

				// Check for Ticket link
				const isTicket = lowerHref.includes('ticket') || lowerText.includes('ticket') || lowerText.includes('工单');
				if (isTicket && !primaryAction) {
					seenUrls.add(rawHref);
					const label = subjectTicketId
						? `🎫 打开工单 #${subjectTicketId}`
						: (linkText ? `🎫 ${truncateLabel(linkText, 18)}` : '🎫 打开工单');
					primaryAction = { text: label, url: rawHref };
					continue;
				}

				// Check for Verify / Confirm / Activate / Reset Password CTA
				const isVerify =
					lowerHref.includes('verify') || lowerText.includes('verify') ||
					lowerHref.includes('activate') || lowerText.includes('activate') ||
					lowerHref.includes('confirm') || lowerText.includes('confirm') ||
					lowerHref.includes('reset') || lowerText.includes('reset password') ||
					lowerText.includes('验证') || lowerText.includes('激活') || lowerText.includes('确认');

				if (isVerify && !primaryAction) {
					seenUrls.add(rawHref);
					const label = linkText ? `🔗 ${truncateLabel(linkText, 20)}` : '🔗 点击验证/激活';
					primaryAction = { text: label, url: rawHref };
					continue;
				}

				// Check for Login / Dashboard / Console
				const isLogin =
					lowerHref.includes('login') || lowerHref.includes('signin') ||
					lowerHref.includes('dashboard') || lowerHref.includes('console') ||
					lowerText.includes('login') || lowerText.includes('sign in') ||
					lowerText.includes('dashboard') || lowerText.includes('登录') || lowerText.includes('控制台');

				if (isLogin && !loginAction) {
					seenUrls.add(rawHref);
					const label = linkText ? `🔑 ${truncateLabel(linkText, 14)}` : '🔑 登录控制台';
					loginAction = { text: label, url: rawHref };
					continue;
				}

				// Other meaningful CTA buttons with short concise text
				if (linkText && linkText.length >= 2 && linkText.length <= 30 && secondaryActions.length < 2) {
					seenUrls.add(rawHref);
					secondaryActions.push({
						text: `🔗 ${truncateLabel(linkText, 16)}`,
						url: rawHref
					});
				}
			}
		} catch (e) {
			console.warn('提取邮件链接异常:', e.message);
		}
	}

	// 1. Top Primary CTA Button (full width)
	if (primaryAction) {
		buttons.push([primaryAction]);
	}

	// 2. Secondary 2-Column Row (Brand website + Login / Secondary action)
	const middleRow = [];

	// Add brand official website if sender is a custom domain
	if (senderDomain && !PUBLIC_EMAIL_DOMAINS.has(senderDomain) && !senderDomain.includes('popyq.com')) {
		const brandSiteUrl = `https://${senderDomain}`;
		if (!seenUrls.has(brandSiteUrl)) {
			seenUrls.add(brandSiteUrl);
			middleRow.push({
				text: brandName ? `🌐 访问 ${brandName} 官网` : `🌐 访问官网`,
				url: brandSiteUrl
			});
		}
	}

	if (loginAction && middleRow.length < 2) {
		middleRow.push(loginAction);
	}

	for (const sec of secondaryActions) {
		if (middleRow.length >= 2) break;
		middleRow.push(sec);
	}

	if (middleRow.length > 0) {
		buttons.push(middleRow);
	}

	// 3. Verification Code Copy Button (if present)
	if (email.code) {
		buttons.push([
			{
				text: `🔑 复制验证码: ${email.code}`,
				copy_text: { text: email.code }
			}
		]);
	}

	// 4. Full HTML View Button (always present as fallback view, opens in system default browser)
	if (webAppUrl) {
		buttons.push([
			{
				text: '📖 网页完整 HTML 视图',
				url: webAppUrl
			}
		]);
	}

	return buttons;
}

export default extractEmailActions;
