/** What a hook and a handler read: the request, and what the route sets on its response. */
import type { FreeReplyFunction } from '../../reply/reply';
import type { PathParams } from '../../types/path';
import type { OutputAt, ResponsesOf } from './schema';
import type { RedirectFunction, TypedReplyFunction } from './typed-reply';

/** What every hook reads, routed or not. */
export interface RequestContext {
	readonly request: Request;
	readonly url: URL;
	/** The server that took the request; none when the app is called through `fetch` alone. */
	readonly server: Bun.Server<unknown> | undefined;
	/** The client's address, as the app's `ip` option reads it. */
	readonly ip: string | undefined;
	/**
	 * The route the request reached, as declared — `/users/:id`: routing
	 * runs before every middleware, so each one reads it; `undefined` for a
	 * request that reached none.
	 */
	readonly route: string | undefined;
	/** The error a route failed with, once it has: what became its 500, or a middleware's reply. */
	readonly error: unknown;
}

/**
 * The cookies a route sets on its response: Bun's `CookieMap`, empty when
 * the request starts. It holds what this response sets, not what the
 * request sent: read those from `ctx.cookies`.
 */
export interface ResponseCookies extends Bun.CookieMap {
	/**
	 * The value of a cookie **this response** set, or `null`. Not the
	 * request's: the map starts empty, so a hook reading a session cookie
	 * here always gets `null`. Read the request's from `ctx.cookies`.
	 */
	get(name: string): string | null;
	/** Whether **this response** set (or deleted) `name`. Not the request's: see `ctx.cookies`. */
	has(name: string): boolean;
}

/** What a route sets on its response, whatever the status. */
export interface ResponseSettings {
	readonly headers: Headers;
	/**
	 * Cookies set or deleted on the response: each change is a `Set-Cookie`
	 * header. The response's side only: it starts empty, and `get` reads back what
	 * this response set. The request's cookies are `ctx.cookies`.
	 */
	readonly cookies: ResponseCookies;
}

/** What every route hook and handler reads, before the request is validated. */
export interface BaseContext extends RequestContext {
	/**
	 * The route's path as declared, `/users/:id`, not as requested; none in
	 * a hook or middleware that runs on a request no route matches, before
	 * its 404 or 405. A handler's is always the route's.
	 */
	readonly route: string | undefined;
	/**
	 * The path parameters as they arrived, before the route's `params`
	 * schema: what a hook reads, since it runs before validation.
	 */
	readonly pathParams: Readonly<Record<string, string>>;
	/**
	 * The request's cookies, by name, as the `Cookie` header sent them —
	 * what a hook reads, since it runs before validation. Parsed on first
	 * read. A route's `cookies` schema gives its handler the validated
	 * values instead; a hook always reads these.
	 */
	readonly cookies: Readonly<Record<string, string>>;
	readonly set: ResponseSettings;
	/** A reply that ends the request here. A hook's is added to every route after it. */
	readonly reply: FreeReplyFunction;
	readonly redirect: RedirectFunction;
}

/** What a handler reads: the request validated, and what each hook added. */
export type Context<Ctx, Path extends string, Schema> = Omit<
	BaseContext,
	'reply' | 'cookies' | 'route'
> &
	Ctx & {
		/** The route's path as declared, `/users/:id`, not as requested. */
		readonly route: string;
		readonly params: OutputAt<Schema, 'params', PathParams<Path>>;
		readonly query: OutputAt<
			Schema,
			'query',
			Readonly<Record<string, string | readonly string[]>>
		>;
		readonly headers: OutputAt<
			Schema,
			'headers',
			Readonly<Record<string, string>>
		>;
		readonly cookies: OutputAt<
			Schema,
			'cookies',
			Readonly<Record<string, string>>
		>;
		readonly body: OutputAt<Schema, 'body', undefined>;
		readonly reply: [ResponsesOf<Schema>] extends [never]
			? FreeReplyFunction
			: TypedReplyFunction<ResponsesOf<Schema>>;
	};
