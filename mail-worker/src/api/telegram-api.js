import app from '../hono/hono';
import result from '../model/result';
import telegramService from '../service/telegram-service';

app.get('/telegram/getEmail/:token', async (c) => {
	const content = await telegramService.getEmailContent(c, c.req.param(), c.req.query());
	c.header('Cache-Control', 'private, max-age=300');
	c.header('Content-Security-Policy', `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'`);
	return c.html(content);
});

app.post('/telegram/translate/:token', async (c) => {
	let body = {};
	try {
		body = await c.req.json();
	} catch {
		body = {};
	}
	const data = await telegramService.translateEmailByToken(c, c.req.param('token'), body?.target || 'zh');
	return c.json(result.ok(data));
});

app.post('/telegram/webhook', async (c) => {
	let update = {};
	try {
		update = await c.req.json();
	} catch {
		update = {};
	}
	const secretHeader = c.req.header('X-Telegram-Bot-Api-Secret-Token') || '';
	await telegramService.handleWebhook(c, update, secretHeader);
	return c.json({ ok: true });
});
