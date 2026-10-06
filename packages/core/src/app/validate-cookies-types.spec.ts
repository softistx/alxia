import { describe, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { compose } from './compose-middlewares';
import { defineMiddleware } from './define-middleware';
import type { BaseContext } from './types';
import { validate } from './validate';

// Outputs no `Record<string, string>` takes: an optional cookie, a coerced one.
const Session = z.object({
	sid: z.string().optional(),
	visits: z.coerce.number(),
});

const counted = defineMiddleware(async (_ctx, next) => next({ k: 1 }));
const based = defineMiddleware<BaseContext>()(async (_ctx, next) => next());
const guard = defineMiddleware<{ k: number }>()(({ k, reply }, next) =>
	k > 0 ? next({ user: 'ada' }) : reply(403, { error: 'forbidden' as const }),
);

describe('the middlewares after validate({ cookies })', () => {
	test('take one that reads the cookies raw, or reads none', () => {
		alxia().get(
			'/',
			validate({ cookies: Session }),
			counted,
			based,
			guard,
			compose(counted, based),
			({ cookies, k, user, reply }) => {
				expectTypeOf(cookies).toEqualTypeOf<z.output<typeof Session>>();
				return reply(200, { visits: cookies.visits, k, user });
			},
		);
		alxia().get(
			'/inline',
			validate({ cookies: Session }),
			async ({ cookies }, next) => next({ visits: cookies.visits }),
			({ visits, reply }) => reply(200, { visits }),
		);
	});

	test('take one that reads a shape the validated cookies give', () => {
		const signed = defineMiddleware<{ cookies: { sid: string } }>()(
			({ cookies }, next) => next({ sid: cookies.sid }),
		);
		alxia().get(
			'/',
			validate({ cookies: z.object({ sid: z.string() }) }),
			signed,
			({ sid, reply }) => reply(200, { sid }),
		);
	});

	test('refuse one that reads a shape they do not give', () => {
		const signed = defineMiddleware<{ cookies: { sid: string } }>()(
			({ cookies }, next) => next({ sid: cookies.sid }),
		);
		const counter = defineMiddleware<{ cookies: { visits: string } }>()(
			async (_ctx, next) => next(),
		);
		const refused = () => {
			throw new Error('never runs');
		};
		alxia().get(
			'/',
			validate({ cookies: Session }),
			// @ts-expect-error `sid` is optional in the validated cookies
			signed,
			refused,
		);
		alxia().get(
			'/visits',
			validate({ cookies: Session }),
			// @ts-expect-error `visits` is a number once validated
			counter,
			refused,
		);
	});
});
