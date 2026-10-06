// After a `validate({ cookies })` whose output is no `Record<string, string>`
// — an optional cookie, a coerced one — a route still takes the middlewares
// that read the cookies raw, `BaseContext`'s: one made by `defineMiddleware`
// with no context of its own, one typed by `BaseContext`, a guard typed by
// what it requires. Each route must compile, its types named through
// `@alxia/core`.
import {
	alxia,
	type BaseContext,
	compose,
	defineMiddleware,
	validate,
} from '@alxia/core';

interface Session {
	readonly sid?: string;
	readonly visits: number;
}

/** A Standard Schema written by hand, as a validator's own would type it. */
const Session = {
	'~standard': {
		version: 1,
		vendor: 'fixture',
		validate: (value: unknown) => ({ value: value as Session }),
		types: { input: {} as Record<string, string>, output: {} as Session },
	},
} as const;

export const counted = defineMiddleware(async (_ctx, next) => next({ k: 1 }));
export const based = defineMiddleware<BaseContext>()(async (_ctx, next) =>
	next({ b: true as const }),
);
export const guarded = defineMiddleware<{ k: number }>()(
	({ k, reply }, next) =>
		k > 0 ? next({ user: 'ada' }) : reply(403, { error: 'forbidden' as const }),
);

export function validatedCookies() {
	return alxia()
		.get(
			'/visits',
			validate({ cookies: Session }),
			counted,
			based,
			guarded,
			({ cookies, k, b, user, reply }) =>
				reply(200, { visits: cookies.visits, sid: cookies.sid, k, b, user }),
		)
		.get(
			'/composed',
			validate({ cookies: Session }),
			compose(counted, based),
			({ cookies, k, reply }) => reply(200, { visits: cookies.visits, k }),
		);
}
