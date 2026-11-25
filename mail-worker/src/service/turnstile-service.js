import BizError from '../error/biz-error';
import settingService from './setting-service';
import { t } from '../i18n/i18n'

const turnstileService = {

	isConfigured(settingRow) {
		return Boolean(
			String(settingRow?.siteKey || '').trim() &&
			String(settingRow?.secretKey || '').trim()
		);
	},

	async verify(c, token) {

		const settingRow = await settingService.query(c);

		if (!this.isConfigured(settingRow)) {
			return;
		}

		if (!token) {
			throw new BizError(t('emptyBotToken'),400);
		}

		const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams({
				secret: String(settingRow.secretKey).trim(),
				response: token,
				remoteip: c.req.header('cf-connecting-ip')
			})
		});

		const result = await res.json();

		if (!result.success) {
			throw new BizError(t('botVerifyFail'),400)
		}
	}
};

export default turnstileService;
