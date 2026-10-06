import { describe, expect, test } from 'bun:test';
// By its published name, as the fixture's build imports it: see react-router.spec.ts.
import { type AlxiaArgs, alxiaContext, withAlxia } from '@alxia/react-router';
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	type MiddlewareFunction,
	RouterContextProvider,
} from 'react-router';
import type { Base } from '../fixture/base';

/** React Router's arguments, on a provider holding `ctx` as the catch-all would. */
function argsWith(ctx: unknown) {
	const context = new RouterContextProvider();
	if (ctx !== undefined) context.set(alxiaContext, ctx);
	return {
		context,
		request: new Request('http://localhost/a/7', { method: 'POST' }),
		url: new URL('http://localhost/a/7'),
		params: { id: '7' },
		pattern: '/a/:id',
	};
}

describe('withAlxia', () => {
	test('a loader gets alxia beside the arguments, and returns what fn returns', async () => {
		const loader = withAlxia(
			({ alxia, params }: LoaderFunctionArgs & AlxiaArgs<Base>) => ({
				name: alxia.user?.name ?? null,
				id: params['id'],
			}),
		);
		const args = argsWith({ user: { name: 'Ada' } });
		expect(await loader(args)).toEqual({ name: 'Ada', id: '7' });
	});

	test('an action reads the request and alxia', async () => {
		const action = withAlxia(
			async ({ alxia, request }: ActionFunctionArgs & AlxiaArgs<Base>) => ({
				method: request.method,
				by: alxia.user?.name ?? 'anonymous',
			}),
		);
		expect(await action(argsWith({ user: null }))).toEqual({
			method: 'POST',
			by: 'anonymous',
		});
	});

	test("a middleware's next is passed on", async () => {
		const seen: unknown[] = [];
		const middleware: MiddlewareFunction<Response> = withAlxia(
			async (
				{
					alxia,
				}: Parameters<MiddlewareFunction<Response>>[0] & AlxiaArgs<Base>,
				next,
			) => {
				seen.push(alxia.user?.name);
				return next();
			},
		);
		const response = new Response('ok');
		await middleware(argsWith({ user: { name: 'Bo' } }), async () => response);
		expect(seen).toEqual(['Bo']);
	});

	test("outside reactRouter(), it throws alxiaOf's error", () => {
		const loader = withAlxia(
			({ alxia }: LoaderFunctionArgs & AlxiaArgs) => alxia.route,
		);
		expect(() => loader(argsWith(undefined))).toThrow(
			'this request has no alxia context',
		);
	});

	test('the returned function takes the arguments alone, and keeps the return type', () => {
		const typed = () => {
			const loader = withAlxia(
				({ alxia }: LoaderFunctionArgs & AlxiaArgs<Base>) => ({
					name: alxia.user?.name ?? null,
				}),
			);
			// React Router's arguments alone: no `alxia` to pass.
			const result: { name: string | null } = loader({} as LoaderFunctionArgs);
			withAlxia(({ alxia }: LoaderFunctionArgs & AlxiaArgs<Base>) => {
				// @ts-expect-error: nothing in the fixture's base derives `tenant`
				return alxia.tenant;
			});
			// @ts-expect-error: annotated without AlxiaArgs, fn has no `alxia`
			withAlxia(({ params }: LoaderFunctionArgs) => params);
			// @ts-expect-error: the arguments must hold a provider
			loader({} as Omit<LoaderFunctionArgs, 'context'>);
			withAlxia(({ alxia }) => {
				// @ts-expect-error: unannotated, `alxia` is unknown, not any
				return alxia.user;
			});
			return result;
		};
		expect(typed).toBeFunction();
	});
});
