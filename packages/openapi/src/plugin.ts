import { alxia, type BaseContext, type RouteDefinition } from '@alxia/core';
import { openapi } from './document';
import type { OpenApiDocument, OpenApiOptions } from './types';

export interface DocsOptions extends OpenApiOptions {
	/** Where the document is served. `/openapi.json` by default. */
	readonly path?: `/${string}`;
	/**
	 * Where an API reference page, [Scalar](https://scalar.com), is served;
	 * `false` for none. `/docs` by default.
	 */
	readonly ui?: `/${string}` | false;
}

/**
 * A plugin that serves the OpenAPI document of `app`, and a page to read it.
 * The document is made at its first request, so it holds every route,
 * those declared after the plugin is used included.
 *
 * ```ts
 * const app = alxia().get(...);
 * app.use(docs(app, { info: { title: 'Users', version: '1.0.0' } }));
 * ```
 */
export function docs(
	app: { readonly routes: readonly RouteDefinition[] },
	options: DocsOptions,
) {
	const path = options.path ?? '/openapi.json';
	const ui = options.ui ?? '/docs';
	let document: OpenApiDocument | undefined;
	const serve = ({ reply }: BaseContext) => {
		document ??= openapi(app, {
			...options,
			exclude: (route) =>
				served.has(route.handler) || (options.exclude?.(route) ?? false),
		});
		return reply(200, document);
	};
	served.add(serve);
	const plugin = alxia().get(path, { detail: { tags: ['docs'] } }, serve);
	if (ui === false) return plugin;
	const show = ({ url, reply }: BaseContext) =>
		reply(
			200,
			page(options.info.title, join(prefixOf(url.pathname, ui), path)),
			{
				headers: {
					'content-type': 'text/html;charset=utf-8',
					'content-security-policy': PAGE_POLICY,
				},
			},
		);
	served.add(show);
	return plugin.get(ui, show);
}

/**
 * The handlers of every `docs` plugin, known by identity: under a prefix or
 * a group their paths are not the ones given, and no document lists them.
 */
const served = new WeakSet<object>();

/** The prefix before `declared` in the path the page was asked at. */
function prefixOf(pathname: string, declared: string): string {
	const asked =
		pathname.length > 1 && pathname.endsWith('/')
			? pathname.slice(0, -1)
			: pathname;
	if (declared === '/') return asked === '/' ? '' : asked;
	return asked.slice(0, asked.length - declared.length);
}

function join(prefix: string, path: string): string {
	if (prefix === '') return path;
	return path === '/' ? prefix : `${prefix}${path}`;
}

/** What the reference page loads: Scalar from jsDelivr, and the document from here. */
const PAGE_POLICY = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
	"style-src 'self' 'unsafe-inline' https:",
	"img-src 'self' data: https:",
	"font-src 'self' data: https:",
	"connect-src 'self'",
].join('; ');

function page(title: string, spec: string): string {
	const html = (text: string) =>
		text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${html(title)}</title>
</head>
<body>
<script id="api-reference" data-url="${html(spec)}"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
}
