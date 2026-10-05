import {
	alxia,
	type BaseContext,
	markFactory,
	type RouteDefinition,
} from '@alxia/core';
import { type DocsServer, loadSpec } from './api-docs-spec';
import { type DocsUi, freshNonce, page, policy } from './api-docs-ui';

export type { DocsServer, DocsUi };

export interface ApiDocsOptions {
	/** The OpenAPI document: a path to a YAML or JSON file, read once at startup, or the object. */
	readonly spec: string | object;
	/** Where the page is served; the spec is at `${path}/openapi.yaml` and `.json`. Defaults to `/docs`. */
	readonly path?: `/${string}`;
	/** `'scalar'` (default) or `'swagger'`, loaded from a pinned CDN version. */
	readonly ui?: DocsUi;
	/** The page's title. Defaults to the document's `info.title`, else "API documentation". */
	readonly title?: string;
	/** Replaces the document's `servers`, in the page and in both files. */
	readonly servers?: readonly DocsServer[];
	/** `false` mounts nothing. Defaults to `true`. */
	readonly enabled?: boolean;
}

type PageContext = Pick<BaseContext, 'url' | 'reply'>;

/** The handlers `apiDocs()` declared: `matchesSpec` leaves their routes out. */
const declared = new WeakSet<RouteDefinition['handler']>();

/**
 * Whether `apiDocs()` declared this route: the page and the two files.
 * `matchesSpec` already leaves them out; this is for a check of your own.
 */
export function isApiDocsRoute(
	route: Pick<RouteDefinition, 'handler'>,
): boolean {
	return declared.has(route.handler);
}

/**
 * An interactive page for the OpenAPI document, and the document itself:
 * `GET /docs`, `GET /docs/openapi.yaml` and `GET /docs/openapi.json`. The
 * page sets its own `Content-Security-Policy`, which `secureHeaders` keeps.
 *
 * ```ts
 * app.plugin(apiDocs({ spec: 'openapi.yaml' }));
 * ```
 */
export function apiDocs(options: ApiDocsOptions) {
	const { path = '/docs', ui = 'scalar', enabled = true } = options;
	if (!/^\/.*[^/]$/.test(path)) {
		throw new TypeError(
			`apiDocs(): the path "${path}" must start with "/" and not end with one`,
		);
	}
	if (ui !== 'scalar' && ui !== 'swagger') {
		throw new TypeError(`apiDocs(): ui "${ui}" is not "scalar" or "swagger"`);
	}
	const app = alxia();
	if (!enabled) return app;
	const spec = loadSpec(options.spec, options.servers);
	const title = options.title ?? titleOf(spec.json);

	const html = ({ url, reply }: PageContext) => {
		const nonce = freshNonce();
		const specUrl = `${url.pathname.replace(/\/+$/, '')}/openapi.json`;
		return reply.html(200, page(ui, { title, specUrl, nonce }), {
			headers: {
				'content-security-policy': policy(ui, nonce, spec.origins),
			},
		});
	};
	const yaml = ({ reply }: PageContext) =>
		reply(200, spec.yaml, { headers: { 'content-type': 'application/yaml' } });
	const json = ({ reply }: PageContext) =>
		reply(200, spec.json, { headers: { 'content-type': 'application/json' } });
	for (const handler of [html, yaml, json]) declared.add(handler);
	return app
		.get(path, html)
		.get(`${path}/openapi.yaml`, yaml)
		.get(`${path}/openapi.json`, json);
}

function titleOf(json: string): string {
	const info = (JSON.parse(json) as { info?: { title?: unknown } }).info;
	return typeof info?.title === 'string' && info.title !== ''
		? info.title
		: 'API documentation';
}

markFactory(apiDocs, 'plugin');
