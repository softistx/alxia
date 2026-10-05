import type { RequestContext } from '@alxia/core';

export function defaultName(ctx: RequestContext): string {
	return `${ctx.request.method} ${ctx.url.pathname}`;
}

/** A hook, and what to answer when it throws: observability never costs the request. */
export function guarded<T>(
	hook: (ctx: RequestContext) => T,
	fallback: (ctx: RequestContext) => T,
): (ctx: RequestContext) => T {
	return (ctx) => {
		try {
			return hook(ctx);
		} catch {
			return fallback(ctx);
		}
	};
}
