/**
 * A Scope is a fetch's, never a Request's: the same Request fetched twice,
 * in turn or at once, gets two Scopes. Ownership lives on the context,
 * which core copies after a `validate` of the cookies.
 */
import { describe, expect, test } from 'bun:test';
import { alxia, validate } from '@alxia/core';
import { container, token } from '@nxgt/di';
import { di } from './di';

const Id = token<number>()('id');

function setup() {
	let made = 0;
	const deps = di(
		container().provide(Id, () => ++made, { lifetime: 'scoped' }),
	);
	const app = alxia()
		.use(deps)
		.get('/', async ({ scope, reply }) => reply(200, await scope.resolve(Id)));
	return { app, deps };
}

/** A schema that takes any cookies as they are. */
const anyCookies = {
	'~standard': {
		version: 1 as const,
		vendor: 'spec',
		validate: (value: unknown) => ({
			value: value as Readonly<Record<string, string>>,
		}),
	},
};

describe('one Request, several fetches', () => {
	test('fetched twice in turn: both answered, each with its own Scope', async () => {
		const { app } = setup();
		const request = new Request('http://localhost/');

		const first = await app.fetch(request);
		const second = await app.fetch(request);

		expect([first.status, second.status]).toEqual([200, 200]);
		expect([await first.text(), await second.text()]).toEqual(['1', '2']);
	});

	test('fetched twice at once: no scoped value crosses', async () => {
		const { app } = setup();
		const request = new Request('http://localhost/');

		const answers = await Promise.all([app.fetch(request), app.fetch(request)]);
		const ids = await Promise.all(answers.map((answer) => answer.text()));

		expect(ids.sort()).toEqual(['1', '2']);
	});
});

describe('ownership on the context', () => {
	test('survives the copy a validate of the cookies makes', async () => {
		const { deps } = setup();
		const seen: unknown[] = [];
		const app = alxia()
			.use(deps)
			.get(
				'/',
				(ctx, next) => {
					seen.push(ctx.scope);
					return next();
				},
				validate({ cookies: anyCookies }),
				// A cast around core's typing: after validate({ cookies }), the
				// context's cookies have another type than the base context's,
				// and core refuses any middleware reading the base one there. The
				// runtime copy is what this spec is about.
				deps as never,
				async ({ scope, reply }) => {
					seen.push(scope);
					return reply(200, await scope.resolve(Id));
				},
			);

		expect(await (await app.request('/')).text()).toBe('1');
		expect(seen[0]).toBe(seen[1]);
	});
});

describe("a 405's owners", () => {
	test("each group's Scope stays its own, Slots from its own derive", async () => {
		const Who = token<string>()('who');
		const Other = token<string>()('other');
		const appDeps = di(
			container().provide(Other, () => 'app', { lifetime: 'scoped' }),
		);
		const deps = di(container().slot(Who), {
			slots: ({ who }: { who: string }) => ({ who }),
		});
		const seen: string[] = [];
		const guard =
			(name: string) =>
			async (
				ctx: { scope: { resolve(token: typeof Who): Promise<string> } },
				next: () => Promise<Response>,
			) => {
				seen.push(`${name} ${await ctx.scope.resolve(Who)}`);
				return next();
			};
		const app = alxia()
			.use(appDeps)
			.use(async ({ scope }, next) => {
				await scope.resolve(Other); // the app's di makes its entry first
				return next();
			})
			.group((g1) =>
				g1
					.use((_ctx, next) => next({ who: 'admin' }))
					.use(deps)
					.use(guard('g1'))
					.get('/x', ({ reply }) => reply(200, 'g1')),
			)
			.group((g2) =>
				g2
					.use((_ctx, next) => next({ who: 'guest' }))
					.use(deps)
					.use(guard('g2'))
					.post('/x', ({ reply }) => reply(200, 'g2')),
			);

		const res = await app.request('/x', { method: 'DELETE' });

		expect(res.status).toBe(405);
		expect(seen).toEqual(['g1 admin', 'g2 guest']);
	});
});
