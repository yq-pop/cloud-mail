import { parseHTML } from 'linkedom';
import domainUtils from '../utils/domain-uitls.js';

export default function emailHtmlTemplate(html, domain) {

	if (!html) {
		return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Empty Email</title></head><body><p>(No content)</p></body></html>';
	}

	if (domain) {
		html = html.replace(/{{domain}}/g, domainUtils.toOssDomain(domain) + '/');
	}

	try {
		const { document } = parseHTML(html);

		// 仅移除潜在风险的脚本，完整保留原始正文、图片、排版、样式和布局
		document.querySelectorAll('script').forEach(script => script.remove());

		// 确保页面具备标准 head、编码及视口配置
		let head = document.querySelector('head');
		if (!head) {
			head = document.createElement('head');
			document.documentElement.prepend(head);
		}

		if (!document.querySelector('meta[charset]')) {
			const metaCharset = document.createElement('meta');
			metaCharset.setAttribute('charset', 'UTF-8');
			head.prepend(metaCharset);
		}

		if (!document.querySelector('meta[name="viewport"]')) {
			const metaViewport = document.createElement('meta');
			metaViewport.setAttribute('name', 'viewport');
			metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
			head.appendChild(metaViewport);
		}

		return document.toString();
	} catch (e) {
		// 若解析出现异常，直接原样返回原始 html
		return html;
	}

}
