function escapeHtml(text = '') {
	return String(text)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

function safeJson(value) {
	return JSON.stringify(value)
		.replace(/</g, '\\u003C')
		.replace(/>/g, '\\u003E')
		.replace(/&/g, '\\u0026')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

export default function emailTextTemplate(text, options = {}) {
	const rawText = String(text || '');
	const token = String(options?.token || '');
	const subject = String(options?.subject || '');
	const autoTranslate = Boolean(options?.autoTranslate);

	const payloadJson = safeJson({
		text: rawText,
		subject,
		token,
		autoTranslate,
		translateUrl: token ? `/api/telegram/translate/${encodeURIComponent(token)}` : '',
	});

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject ? escapeHtml(subject) : 'Email'}</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        html, body {
            width: 100%;
            min-height: 100%;
            background: #ffffff;
            color: #13181d;
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
        }

        .tg-translate-bar {
            position: sticky;
            top: 0;
            z-index: 20;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            flex-wrap: wrap;
            padding: 8px 12px;
            background: #f5f7fa;
            border-bottom: 1px solid #e4e7ed;
            font-size: 13px;
            line-height: 1.4;
        }

        .tg-translate-bar.is-translated {
            background: #ecf5ff;
            border-bottom-color: #c6e2ff;
        }

        .tg-translate-left {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            flex-wrap: wrap;
        }

        .tg-translate-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: #1890ff;
            flex-shrink: 0;
        }

        .tg-translate-status {
            color: #303133;
            font-size: 12.5px;
        }

        .tg-translate-status.is-error {
            color: #f56c6c;
        }

        .tg-lang-select {
            height: 28px;
            padding: 0 8px;
            border-radius: 6px;
            border: 1px solid #dcdfe6;
            background: #ffffff;
            color: #303133;
            font-size: 12.5px;
            outline: none;
            cursor: pointer;
        }

        .tg-lang-select:focus {
            border-color: #1890ff;
        }

        .tg-translate-actions {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
            margin-left: auto;
        }

        .tg-btn {
            height: 28px;
            padding: 0 12px;
            border-radius: 6px;
            border: 1px solid #1890ff;
            background: #1890ff;
            color: #ffffff;
            font-size: 12.5px;
            font-weight: 500;
            cursor: pointer;
            white-space: nowrap;
            transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
        }

        .tg-btn:hover:not(:disabled) {
            background: #1064c0;
            border-color: #1064c0;
        }

        .tg-btn.is-outline {
            background: #ffffff;
            color: #1890ff;
            border-color: #91d5ff;
        }

        .tg-btn.is-outline:hover:not(:disabled) {
            background: #1890ff;
            border-color: #1890ff;
            color: #ffffff;
        }

        .tg-btn:disabled {
            opacity: 0.65;
            cursor: not-allowed;
        }

        .tg-subject-bar {
            padding: 10px 12px 6px;
            font-size: 16px;
            font-weight: 600;
            color: #13181d;
            border-bottom: 1px solid #f0f2f5;
            word-break: break-word;
            background: #ffffff;
        }

        .text-box {
            padding: 12px;
            width: 100%;
            overflow: auto;
        }

        .text-content {
            display: block;
            font-family: inherit;
            font-size: 14px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-word;
            color: #13181d;
        }
    </style>
</head>
<body>
    ${token ? `<div id="tg-translate-bar" class="tg-translate-bar">
        <div class="tg-translate-left">
            <span class="tg-translate-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 8h10M10 5v3m-4 0c1 3.8 3.6 6.8 7 8.5M13 8c-.9 3.5-3.2 6.4-7 8.5" />
                    <path d="M13.5 19l3.2-8.5L20 19m-5.5-2.5h4.5" />
                </svg>
            </span>
            <span id="tg-translate-status" class="tg-translate-status">邮件翻译</span>
            <select id="tg-lang-select" class="tg-lang-select" aria-label="目标语言">
                <option value="zh" selected>简体中文</option>
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="es">Español</option>
                <option value="ru">Русский</option>
                <option value="pt">Português</option>
            </select>
        </div>
        <div class="tg-translate-actions">
            <button id="tg-translate-btn" type="button" class="tg-btn">立即翻译</button>
        </div>
    </div>` : ''}
    ${subject ? `<div id="tg-subject-bar" class="tg-subject-bar">${escapeHtml(subject)}</div>` : ''}
    <div class="text-box">
        <span id="tg-text-content" class="text-content">${escapeHtml(rawText)}</span>
    </div>
    ${token ? `<script>
        (function () {
            const payload = ${payloadJson};
            const subjectEl = document.getElementById('tg-subject-bar');
            const textEl = document.getElementById('tg-text-content');
            const barEl = document.getElementById('tg-translate-bar');
            const statusEl = document.getElementById('tg-translate-status');
            const langEl = document.getElementById('tg-lang-select');
            const btnEl = document.getElementById('tg-translate-btn');
            const cache = new Map();

            let loading = false;
            let showingTranslated = false;
            let activeLang = '';
            let reqSeq = 0;

            function getLangLabel() {
                const opt = langEl.options[langEl.selectedIndex];
                return opt ? opt.textContent : '简体中文';
            }

            function setSubject(value) {
                if (subjectEl) subjectEl.textContent = value || '';
                if (value) document.title = value;
            }

            function setIdleState(errorText) {
                barEl.classList.remove('is-translated');
                statusEl.classList.toggle('is-error', Boolean(errorText));
                statusEl.textContent = errorText || '邮件可翻译为';
                btnEl.classList.remove('is-outline');
                btnEl.disabled = false;
                btnEl.textContent = errorText ? '重试翻译' : '立即翻译';
                langEl.disabled = false;
            }

            function setTranslatedState() {
                barEl.classList.add('is-translated');
                statusEl.classList.remove('is-error');
                statusEl.textContent = '已翻译为';
                btnEl.classList.add('is-outline');
                btnEl.disabled = false;
                btnEl.textContent = '显示原文';
                langEl.disabled = false;
            }

            function showOriginal() {
                showingTranslated = false;
                activeLang = '';
                setSubject(payload.subject);
                textEl.textContent = payload.text;
                setIdleState('');
            }

            async function runTranslate() {
                if (loading) return;
                const target = langEl.value || 'zh';
                const cached = cache.get(target);
                if (cached) {
                    showingTranslated = true;
                    activeLang = target;
                    setSubject(cached.subject || payload.subject);
                    textEl.textContent = cached.text || payload.text;
                    setTranslatedState();
                    return;
                }

                loading = true;
                const currentSeq = ++reqSeq;
                barEl.classList.remove('is-translated');
                statusEl.classList.remove('is-error');
                statusEl.textContent = '正在翻译为 ' + getLangLabel() + '...';
                btnEl.disabled = true;
                btnEl.classList.remove('is-outline');
                btnEl.textContent = '翻译中...';
                langEl.disabled = true;

                try {
                    const res = await fetch(payload.translateUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ target }),
                    });
                    const body = await res.json();
                    if (currentSeq !== reqSeq) return;
                    if (!res.ok || body?.code !== 200 || !body?.data) {
                        throw new Error(body?.message || '翻译失败，请稍后重试');
                    }
                    cache.set(target, body.data);
                    showingTranslated = true;
                    activeLang = target;
                    setSubject(body.data.subject || payload.subject);
                    textEl.textContent = body.data.text || payload.text;
                    setTranslatedState();
                } catch (err) {
                    if (currentSeq !== reqSeq) return;
                    showingTranslated = false;
                    activeLang = '';
                    setIdleState(err?.message || '翻译失败，请稍后重试');
                } finally {
                    if (currentSeq === reqSeq) {
                        loading = false;
                    }
                }
            }

            setIdleState('');

            btnEl.addEventListener('click', function () {
                if (loading) return;
                if (showingTranslated && activeLang === langEl.value) {
                    showOriginal();
                } else {
                    runTranslate();
                }
            });

            langEl.addEventListener('change', function () {
                if (showingTranslated) {
                    runTranslate();
                }
            });

            if (payload.autoTranslate) {
                runTranslate();
            }
        })();
    </script>` : ''}
</body>
</html>`;
}
