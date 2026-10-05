import { describe, expect, expectTypeOf, test } from 'bun:test';
import { join } from 'node:path';
import {
	alxia,
	type BaseContext,
	defineMiddleware,
	type Empty,
	validate,
} from '@alxia/core';
import { $ } from 'bun';
import { z } from 'zod';
import {
	ContextStorageError,
	contextStorage,
	getContext,
	getRequestContext,
	runWithContext,
	tryGetContext,
	tryGetRequestContext,
} from './storage';

const base = alxia()
	.decorate({ greeting: 'hello' })
	.derive(({ request }) => ({
		user: request.headers.get('x-user') ?? 'anonymous',
	}));

const requestContext = contextStorage<typeof base>();

/** A service, three calls down: no context passed. */
async function greet(): Promise<string> {
	await Bun.sleep(Math.random() * 10);
	await new Promise((resolve) => setTimeout(resolve, 1));
	const { greeting, user, set } = requestContext.context();
	expectTypeOf(user).toBeString();
	set.headers.set('x-greeted', user);
	return `${greeting} ${user}`;
}

const seenOnResponse: (string | undefined)[] = [];

const app = base
	.get('/before', ({ reply }) =>
		reply(200, tryGetContext() === undefined ? 'none' : 'some'),
	)
	.use(requestContext)
	.use(
		defineMiddleware(async (_ctx, next) => {
			const response = await next();
			seenOnResponse.push(getRequestContext().route);
			return response;
		}),
	)
	.get(
		'/greet/:id',
		validate({ params: z.object({ id: z.coerce.number() }) }),
		async ({ reply }) =>
			reply(200, {
				text: await greet(),
				id: getContext<{ params: { id: number } }>().params.id,
			}),
	);

describe('contextStorage', () => {
	test('a service reads the context of its request, typed by the app', async () => {
		const response = await app.request('/greet/7', {
			headers: { 'x-user': 'ada' },
		});
		expect(await response.json()).toEqual({ text: 'hello ada', id: 7 });
		expect(response.headers.get('x-greeted')).toBe('ada');
	});

	test('concurrent requests never see each other', async () => {
		const users = Array.from({ length: 20 }, (_, index) => `user-${index}`);
		const answers = await Promise.all(
			users.map(
				async (user) =>
					(
						await (
							await app.request('/greet/1', { headers: { 'x-user': user } })
						).json()
					).text,
			),
		);
		expect(answers).toEqual(users.map((user) => `hello ${user}`));
	});

	test('a middleware after it reads the request context, a 404 included', async () => {
		seenOnResponse.length = 0;
		await app.request('/greet/1');
		await app.request('/nowhere');
		expect(seenOnResponse).toEqual(['/greet/:id', undefined]);
	});

	test('outside a request, or before the plugin: a typed refusal, or undefined', async () => {
		expect(tryGetContext()).toBeUndefined();
		expect(() => getContext()).toThrow(ContextStorageError);
		try {
			getContext();
		} catch (error) {
			expect((error as ContextStorageError).code).toBe('OUTSIDE_REQUEST');
		}
		expect(await (await app.request('/before')).text()).toBe('none');
	});

	test('the request context without throwing; the factory must be called', async () => {
		expect(tryGetRequestContext()).toBeUndefined();
		const seen: (string | undefined)[] = [];
		const traced = alxia()
			.use(contextStorage())
			.use(
				defineMiddleware(async (_ctx, next) => {
					const response = await next();
					seen.push(tryGetRequestContext()?.url.pathname);
					return response;
				}),
			)
			.get('/here', ({ reply }) => reply.ok('here'));
		await traced.request('/here');
		await traced.request('/nowhere');
		expect(seen).toEqual(['/here', '/nowhere']);

		// The factory, uncalled, is refused where it is declared.
		expect(() =>
			alxia()
				// @ts-expect-error the factory, uncalled
				.use(contextStorage),
		).toThrow(
			'use(): argument 1 looks like a factory (contextStorage): call it, use(contextStorage())',
		);
	});

	test('runWithContext, for a job or a test', async () => {
		const fake = {
			user: 'job',
			greeting: 'hi',
			set: { headers: new Headers() },
		} as unknown as BaseContext;
		expect(await runWithContext(fake, greet)).toBe('hi job');
	});

	test('typed by the app it names, which the app that mounts it must give', () => {
		expectTypeOf(contextStorage().context).returns.toEqualTypeOf<
			BaseContext & Empty
		>();
		// @ts-expect-error: an app that gives no `user` cannot use it
		alxia().use(contextStorage<typeof base>());
		expect(() => base.use(contextStorage<typeof base>())).not.toThrow();
	});

	test('with no type argument, typed by the app Register names', async () => {
		// `test/register`, a program of its own, through the workspace's tsc:
		// its refusal is a @ts-expect-error, so no output is each one failing.
		const dir = join(import.meta.dir, '..', 'test', 'register');
		const result = await $`${process.execPath} --bun tsc --noEmit -p ${dir}`
			.cwd(import.meta.dir)
			.nothrow()
			.quiet();
		expect(result.stdout.toString() + result.stderr.toString()).toBe('');
	}, 30_000);
});
