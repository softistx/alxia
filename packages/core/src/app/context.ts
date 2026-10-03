/**
 * The context a route's hooks and handler read: the request, bounded by
 * the route's `bodyLimit`, its path parameters as they arrived, and what
 * it sets on its response.
 */
import { createReply, Reply } from '../reply/reply';
import { limitBody } from '../request/limit';
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
 * The context a route's hooks and handler read, and what they set on its
 * response. Under a `bodyLimit`, its `request` is the one whose body is
 * bounded: every reader of the body, core's or the handler's, counts.
 */
export function routeContext(
	definition: RouteDefinition | SocketDefinition,
	request: RequestContext,
	pathParams: Record<string, string>,
): { ctx: Record<string, unknown> & BaseContext; set: ResponseSettings } {
	let cookies: Bun.CookieMap | undefined;
	const set: ResponseSettings & { readonly touched: () => boolean } = {
		headers: new Headers(),
		get cookies() {
			cookies ??= new Bun.CookieMap();
			return cookies;
		},
		touched: () => cookies !== undefined,
	};
	const limit = 'bodyLimit' in definition ? definition.bodyLimit : undefined;
	const ctx: Record<string, unknown> & BaseContext = {
		...request,
		...(limit === undefined
			? {}
			: { request: limitBody(request.request, limit) }),
		route: definition.path,
		pathParams,
		set,
		reply: createReply,
		redirect,
	};
	return { ctx, set };
}
