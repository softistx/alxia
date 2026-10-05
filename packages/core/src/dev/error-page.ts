/**
 * The page a browser gets for a 500 in dev: the error's name, message and
 * stack, the app's own frames marked, a few lines of source, and the
 * request it failed. No external asset: one inline style, allowed by the
 * page's own Content-Security-Policy through a nonce, which
 * `secureHeaders` keeps.
 */
import { type Frame, framesOf, type SourceLine, sourceOf } from './stack';

/** What the page shows of the request. */
export interface FailedRequest {
	readonly method: string;
	readonly path: string;
	/** The route it reached, as declared: none for a request no route matched. */
	readonly route: string | undefined;
}

const STYLE = `
body{margin:0;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;background:#fff;color:#1f2328}
main{max-width:960px;margin:0 auto;padding:24px 16px}
h1{font-size:20px;margin:0 0 4px;color:#b42318;overflow-wrap:anywhere}
p.message{font-size:16px;margin:0 0 16px;white-space:pre-wrap;overflow-wrap:anywhere}
dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;margin:0 0 16px}
dt{color:#59636e}dd{margin:0;font-family:ui-monospace,monospace;overflow-wrap:anywhere}
pre{background:#f6f8fa;padding:12px;overflow-x:auto;border-radius:6px;font:12px/1.5 ui-monospace,monospace}
ol{list-style:none;padding:0;margin:0;font:12px/1.6 ui-monospace,monospace}
li{padding:2px 8px;color:#59636e;overflow-wrap:anywhere}li.app{color:#1f2328;background:#fff8c5;font-weight:600}
mark{background:#ffd8d3;display:block}footer{margin-top:24px;color:#59636e;font-size:12px}
@media (prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}pre{background:#161b22}
li{color:#9198a1}li.app{color:#e6edf3;background:#3b2e00}mark{background:#5c1d18;color:#e6edf3}h1{color:#ff7b72}}
`;

/** The page, and the Content-Security-Policy that lets its style alone in. */
export function errorPage(
	error: unknown,
	request: FailedRequest,
): { readonly html: string; readonly policy: string } {
	const nonce = crypto.randomUUID().replaceAll('-', '');
	const { name, message, stack } = described(error);
	const frames = framesOf(stack);
	const first = frames.find((frame) => frame.app);
	const source = first === undefined ? [] : sourceOf(first);
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>500: ${escapeHtml(name)}</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<main>
<h1>${escapeHtml(name)}</h1>
<p class="message">${escapeHtml(message)}</p>
<dl>
<dt>method</dt><dd>${escapeHtml(request.method)}</dd>
<dt>path</dt><dd>${escapeHtml(request.path)}</dd>
<dt>route</dt><dd>${escapeHtml(request.route ?? 'none matched')}</dd>
</dl>
${sourceBlock(first, source)}
<ol>
${frames.map(frameItem).join('\n')}
</ol>
<footer>alxia in dev (NODE_ENV=development): alxia({ dev: false }), or any other NODE_ENV, answers a 500 without it.</footer>
</main>
</body>
</html>
`;
	const policy = `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
	return { html, policy };
}

/** The error's name, message and stack, whatever was thrown. */
export function described(error: unknown): {
	readonly name: string;
	readonly message: string;
	readonly stack: string;
} {
	if (error instanceof Error) {
		const stack = error.stack ?? `${error.name}: ${error.message}`;
		return { name: error.name, message: error.message, stack };
	}
	const message = String(error);
	return { name: 'thrown', message, stack: message };
}

function sourceBlock(
	frame: Frame | undefined,
	lines: readonly SourceLine[],
): string {
	if (frame === undefined || lines.length === 0) return '';
	const body = lines
		.map((line) => {
			const text = `${String(line.number).padStart(5)}  ${escapeHtml(line.text)}`;
			return line.hit ? `<mark>${text}</mark>` : text;
		})
		.join('\n');
	return `<pre aria-label="${escapeHtml(`${frame.file}:${frame.line}`)}">${body}</pre>`;
}

function frameItem(frame: Frame): string {
	return `<li${frame.app ? ' class="app"' : ''}>${escapeHtml(frame.text)}</li>`;
}

const ENTITIES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
};

function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (char) => ENTITIES[char] as string);
}
