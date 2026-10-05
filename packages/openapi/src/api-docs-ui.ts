/** The two interactive pages, loaded from a CDN: pinned, and checked by SRI. */

export type DocsUi = 'scalar' | 'swagger';

const CDN = 'https://cdn.jsdelivr.net';

/** Each UI's files: the one pinned version's folder, which its policy allows alone. */
const FILES = {
	scalar: `${CDN}/npm/@scalar/api-reference@1.72.4/`,
	swagger: `${CDN}/npm/swagger-ui-dist@5.33.1/`,
} as const;

const SCALAR = {
	src: `${FILES.scalar}dist/browser/standalone.js`,
	integrity:
		'sha384-omTRdD9MbjA1vm12DqRUVvqJlr3VzSixvAdF1Jruu9AJOiJKyTKraIB6DyX+m10M',
} as const;

const SWAGGER = {
	script: `${FILES.swagger}swagger-ui-bundle.js`,
	scriptIntegrity:
		'sha384-ZPehFMQommnnuaZ4rpxgkgTT2DKFVp4hZC/7pLit+9Lek9T1YGSo23eHFbvNkXkw',
	css: `${FILES.swagger}swagger-ui.css`,
	cssIntegrity:
		'sha384-Ov4/wv3j2bmct8cDc5X4ngJZohVPzEmc6uDPH8WeljUxO5vtoykvMEfbu9Vh6RaW',
} as const;

/** Text in an HTML body or a quoted attribute. */
export function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

/** A fresh nonce for one page: 128 random bits. */
export function freshNonce(): string {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
		'base64',
	);
}

/** Scalar's fonts, unless the app's own CSS replaces them. */
const SCALAR_FONTS = 'https://fonts.scalar.com';

/**
 * The page's own policy, which `secureHeaders` keeps (a header a route set
 * is kept, as for `@alxia/graphql`'s IDE): the pinned version's scripts
 * and styles alone, the one inline script of Swagger UI by its nonce, and
 * nothing else. Requests go to this server — the spec — and to the
 * `origins` of the document's servers, which "Try it out" calls.
 */
export function policy(
	ui: DocsUi,
	nonce: string,
	origins: readonly string[],
): string {
	const files = FILES[ui];
	const fonts = ui === 'scalar' ? ` ${SCALAR_FONTS}` : '';
	return [
		"default-src 'none'",
		`script-src ${files} 'nonce-${nonce}'`,
		`style-src ${files} 'unsafe-inline'`,
		'img-src https: data:',
		`font-src data:${fonts}`,
		["connect-src 'self'", ...origins].join(' '),
		'worker-src blob:',
		"base-uri 'none'",
		"form-action 'none'",
		"frame-ancestors 'none'",
	].join('; ');
}

/**
 * Scalar's configuration: the document at `url`, and none of the services
 * it would reach beyond this server — its AI agent, its MCP generator,
 * the developer tools that share or deploy the document to scalar.com,
 * its telemetry.
 */
function scalarConfiguration(url: string): string {
	return JSON.stringify({
		url,
		agent: { disabled: true },
		mcp: { disabled: true },
		showDeveloperTools: 'never',
		telemetry: false,
	});
}

export interface PageOptions {
	readonly title: string;
	/** Where the page reads the spec: a URL path, JSON. */
	readonly specUrl: string;
	readonly nonce: string;
}

export function page(ui: DocsUi, options: PageOptions): string {
	return ui === 'swagger' ? swaggerPage(options) : scalarPage(options);
}

function scalarPage({ title, specUrl }: PageOptions): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body>
<script id="api-reference" data-configuration="${escapeHtml(scalarConfiguration(specUrl))}"></script>
<script src="${SCALAR.src}" integrity="${SCALAR.integrity}" crossorigin="anonymous"></script>
</body>
</html>
`;
}

function swaggerPage({ title, specUrl, nonce }: PageOptions): string {
	// `<` escaped: a URL cannot close the script element
	const url = JSON.stringify(specUrl).replaceAll('<', '\\u003c');
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${SWAGGER.css}" integrity="${SWAGGER.cssIntegrity}" crossorigin="anonymous">
</head>
<body>
<div id="swagger-ui"></div>
<script src="${SWAGGER.script}" integrity="${SWAGGER.scriptIntegrity}" crossorigin="anonymous"></script>
<script nonce="${nonce}">window.ui = SwaggerUIBundle({ url: ${url}, dom_id: '#swagger-ui' });</script>
</body>
</html>
`;
}
