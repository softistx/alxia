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
	 * The route the request reached, as declared — `/users/:id` — once
	 * routing has run; `undefined` before, and for a request that reached
	 * none. What an `around` hook names a span after.
	 */
	readonly route: string | undefined;
	/** The error a route failed with, once it has: what became its 500, or its `onError` reply. */
	readonly error: unknown;
}

/** What a route sets on its response, whatever the status. */
export interface ResponseSettings {
	readonly headers: Headers;
	/** Cookies set or deleted: each change is a `Set-Cookie` header. */
	readonly cookies: Bun.CookieMap;
}

/** What every route hook and handler reads, before the request is validated. */
export interface BaseContext extends RequestContext {
	/** The route's path as declared, `/users/:id`, not as requested. */
	readonly route: string;
	/**
	 * The path parameters as they arrived, before the route's `params`
	 * schema: what a hook reads, since it runs before validation.
	 */
	readonly pathParams: Readonly<Record<string, string>>;
	readonly set: ResponseSettings;
	/** A reply that ends the request here. A hook's is added to every route after it. */
	readonly reply: FreeReplyFunction;
	readonly redirect: RedirectFunction;
}

/** What a handler reads: the request validated, and what each hook added. */
export type Context<Ctx, Path extends string, Schema> = Omit<
	BaseContext,
	'reply'
> &
	Ctx & {
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
