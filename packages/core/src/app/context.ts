/**
 * The context a route's middlewares and handler read: the request, bounded by
 * the route's `bodyLimit`, its path parameters as they arrived, and what
 * it sets on its response.
 */
import { createReply, Reply } from '../reply/reply';
import { limitBody } from '../request/limit';
import { readCookies, readHeaders, readQuery } from '../request/read';
import type { RedirectStatus } from '../types/status';
import type { RouteDefinition, SocketDefinition } from './definition';
import type {
	BaseContext,
	RedirectFunction,
	RequestContext,
	ResponseSettings,
} from './types';

const redirect: RedirectFunction = (location, status) =>
	new Reply(status ?? (302 as RedirectStatus), undefined, {
		headers: { location: String(location) },
	}) as never;

/**
 * The context a route's middlewares and handler read, and what they set on its
 * response. Under a `bodyLimit`, its `request` is the one whose body is
 * bounded: every reader of the body, core's or the handler's, counts.
 */
export function routeContext(
	definition: RouteDefinition | SocketDefinition,
	request: RequestContext,
	pathParams: Record<string, string>,
	/** `ctx.route`: the route's declared path; none for a request no route matches. */
	route: string | undefined,
): { ctx: Record<string, unknown> & BaseContext; set: ResponseSettings } {
	let sent: Bun.CookieMap | undefined;
	const set: ResponseSettings & { readonly touched: () => boolean } = {
		headers: new Headers(),
		get cookies() {
			sent ??= new Bun.CookieMap();
			return sent;
		},
		touched: () => sent !== undefined,
	};
	// The request's cookies, parsed on first read: a route no one reads
	// them on never parses its `Cookie` header.
	let received: Readonly<Record<string, string>> | undefined;
	// The query as it arrived, read on first use: what a route's middlewares
	// read before validation replaces it with the schema's output.
	let query: Readonly<Record<string, string | readonly string[]>> | undefined;
	// The headers as an object, read on first use: what a middleware reads
	// as `headers` until a `validate` sets its schema's output.
	let headers: Readonly<Record<string, string>> | undefined;
	const limit = 'bodyLimit' in definition ? definition.bodyLimit : undefined;
	const ctx: Record<string, unknown> & BaseContext = {
		...request,
		...(limit === undefined
			? {}
			: { request: limitBody(request.request, limit) }),
		route,
		pathParams,
		// As they arrived, until validation sets the schemas' output: what
		// the middlewares before a `validate` read as `params` and `query`.
		params: pathParams,
		get query() {
			query ??= readQuery(request.url);
			return query;
		},
		set query(value: Readonly<Record<string, string | readonly string[]>>) {
			query = value;
		},
		get headers() {
			headers ??= readHeaders(request.request.headers);
			return headers;
		},
		set headers(value: Readonly<Record<string, string>>) {
			headers = value;
		},
		get cookies() {
			received ??= readCookies(request.request.headers);
			return received;
		},
		// A setter, so that a `derive` returning `cookies` replaces them
		// rather than throwing on an accessor without one.
		set cookies(value: Readonly<Record<string, string>>) {
			received = value;
		},
		set,
		reply: createReply,
		redirect,
	};
	return { ctx, set };
}
