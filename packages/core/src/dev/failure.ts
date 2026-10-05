/**
 * A 500 in dev: the error shown, not hidden — an HTML page to a client
 * that prefers HTML, a browser; its `stack` in the JSON body or the
 * problem otherwise. Outside dev, `failed` (`answers.ts`) says no more
 * than that the server failed.
 */
import { errorFormat } from '../app/served';
import { problemOf } from '../errors/problems';
import { toResponse } from '../reply/reply';
import { described, errorPage } from './error-page';

/** What the dev answer reads of the request. */
export interface FailedContext {
	readonly request: Request;
	readonly url?: URL;
	readonly route?: string | undefined;
}

/** The 500 a request that failed with `error` gets in dev. */
export function devFailure(error: unknown, ctx: FailedContext): Response {
	const url = ctx.url ?? new URL(ctx.request.url);
	if (prefersHtml(ctx.request.headers.get('accept'))) {
		const { html, policy } = errorPage(error, {
			method: ctx.request.method,
			path: url.pathname,
			route: ctx.route,
		});
		const headers = new Headers({
			'content-type': 'text/html;charset=utf-8',
			'content-security-policy': policy,
			'cache-control': 'no-store',
		});
		return toResponse(500, html, headers);
	}
	const { stack } = described(error);
	if (errorFormat(ctx) === 'json') {
		return toResponse(500, { error: 'internal', stack }, new Headers());
	}
	const body = problemOf(
		{ url },
		{ status: 500, detail: 'The server failed to answer the request', stack },
	);
	return toResponse(
		500,
		body,
		new Headers({ 'content-type': 'application/problem+json' }),
	);
}

/**
 * Whether `accept` ranks `text/html` above JSON: a browser's navigation
 * does, `fetch`'s default `*\/*` and an API client's `application/json`
 * do not.
 */
export function prefersHtml(accept: string | null): boolean {
	if (accept === null) return false;
	let html = 0;
	let json = 0;
	for (const part of accept.split(',')) {
		const [type = '', ...params] = part.trim().toLowerCase().split(';');
		const q = qualityOf(params);
		if (type === 'text/html') html = Math.max(html, q);
		else if (type === 'application/json' || type.endsWith('+json')) {
			json = Math.max(json, q);
		}
	}
	return html > 0 && html > json;
}

function qualityOf(params: readonly string[]): number {
	for (const param of params) {
		const [key, value] = param.trim().split('=');
		if (key === 'q') {
			const q = Number(value);
			return Number.isFinite(q) ? q : 0;
		}
	}
	return 1;
}
