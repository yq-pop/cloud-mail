import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import translationService from '../service/translation-service';

app.post('/email/translate', async (c) => {
	const data = await translationService.translateMail(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});
