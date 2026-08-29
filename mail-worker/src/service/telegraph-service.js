import { parseHTML } from 'linkedom';
import domainUtils from '../utils/domain-uitls.js';

const TELEGRAPH_TAGS = new Set([
	'a', 'aside', 'b', 'blockquote', 'br', 'code', 'em', 'figcaption',
	'figure', 'h3', 'h4', 'hr', 'i', 'iframe', 'img', 'li', 'ol',
	'p', 'pre', 's', 'strong', 'u', 'ul', 'video'
]);

let memoryToken = null;

const telegraphService = {

	async getAccessToken(c) {
		if (c.env?.kv) {
			try {
				const kvToken = await c.env.kv.get('telegraph_access_token');
				if (kvToken) {
					return kvToken;
				}
			} catch (e) {
				console.warn('获取 KV telegraph_access_token 失败:', e.message);
			}
		}

		if (memoryToken) {
			return memoryToken;
		}

		try {
			const res = await fetch('https://api.telegra.ph/createAccount', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					short_name: 'CloudMail',
					author_name: 'CloudMail'
				})
			});
			const data = await res.json();
			if (data.ok && data.result?.access_token) {
				const token = data.result.access_token;
				memoryToken = token;
				if (c.env?.kv) {
					try {
						await c.env.kv.put('telegraph_access_token', token, { expirationTtl: 86400 * 30 });
					} catch (e) {
						console.warn('写入 KV telegraph_access_token 失败:', e.message);
					}
				}
				return token;
			}
		} catch (e) {
			console.error('创建 Telegraph 账号失败:', e.message);
		}

		return null;
	},

	domToTelegraph(node) {
		if (!node) return [];

		// Text node
		if (node.nodeType === 3) {
			const text = node.textContent;
			return text ? [text] : [];
		}

		// Element node only
		if (node.nodeType !== 1) return [];

		const rawTag = (node.tagName || '').toLowerCase();
		if (['script', 'style', 'meta', 'link', 'noscript', 'svg', 'head', 'input', 'button', 'form'].includes(rawTag)) {
			return [];
		}

		let tag = rawTag;
		if (tag === 'h1' || tag === 'h2') tag = 'h3';
		if (tag === 'h5' || tag === 'h6') tag = 'h4';

		const children = [];
		const childNodes = node.childNodes || [];
		for (let i = 0; i < childNodes.length; i++) {
			children.push(...this.domToTelegraph(childNodes[i]));
		}

		const isContainer = [
			'html', 'body', 'div', 'section', 'article', 'main', 'header', 'footer',
			'table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th', 'span', 'font',
			'center', 'tbody', 'dl', 'dt', 'dd'
		].includes(tag);

		if (isContainer || !TELEGRAPH_TAGS.has(tag)) {
			return children;
		}

		const element = { tag };
		if (children.length > 0) {
			element.children = children;
		}

		const attrs = {};
		if (tag === 'a') {
			const href = node.getAttribute ? node.getAttribute('href') : null;
			if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:'))) {
				attrs.href = href;
			}
		}
		if (tag === 'img') {
			const src = node.getAttribute ? node.getAttribute('src') : null;
			if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
				attrs.src = src;
			}
		}

		if (Object.keys(attrs).length > 0) {
			element.attrs = attrs;
		}

		return [element];
	},

	htmlToTelegraphNodes(html, text, r2Domain) {
		if (html) {
			try {
				let processedHtml = html;
				if (r2Domain) {
					processedHtml = processedHtml.replace(/{{domain}}/g, domainUtils.toOssDomain(r2Domain) + '/');
				}
				const { document } = parseHTML(processedHtml);
				const root = document.body || document;
				const nodes = this.domToTelegraph(root);
				if (nodes && nodes.length > 0) {
					return nodes;
				}
			} catch (e) {
				console.warn('解析邮件 HTML 转 Telegraph 节点失败，回退到文本:', e.message);
			}
		}

		if (text) {
			const lines = text.split('\n');
			const nodes = [];
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed) {
					nodes.push({ tag: 'p', children: [trimmed] });
				}
			}
			if (nodes.length > 0) {
				return nodes;
			}
		}

		return [{ tag: 'p', children: ['(Empty email content)'] }];
	},

	async publishEmail(c, email, r2Domain) {
		try {
			const accessToken = await this.getAccessToken(c);
			if (!accessToken) {
				return null;
			}

			const title = (email.subject || 'No Subject').slice(0, 250);
			const authorName = (email.name || email.sendEmail || 'CloudMail').slice(0, 120);
			const nodes = this.htmlToTelegraphNodes(email.content, email.text, r2Domain);

			const res = await fetch('https://api.telegra.ph/createPage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					access_token: accessToken,
					title: title,
					author_name: authorName,
					content: nodes,
					return_content: false
				})
			});

			const data = await res.json();
			if (data.ok && data.result?.url) {
				return data.result.url;
			}

			// 如果 Token 无效，清除缓存重试一次
			if (data.error === 'ACCESS_TOKEN_INVALID') {
				memoryToken = null;
				if (c.env?.kv) {
					await c.env.kv.delete('telegraph_access_token');
				}
			}

			console.error('Telegraph createPage 失败:', data);
		} catch (e) {
			console.error('发布邮件到 Telegraph 异常:', e.message);
		}

		return null;
	}

};

export default telegraphService;
