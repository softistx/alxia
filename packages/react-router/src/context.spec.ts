import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { alxia, type BaseContext, type ContextOf } from '@alxia/core';
// By its published name, as the fixture's build imports it: see react-router.spec.ts.
import { alxiaOf, createServer, type RegisteredOf } from '@alxia/react-router';
import { $ } from 'bun';
import { RouterContextProvider } from 'react-router';
import { configure } from '../fixture/base';

describe('alxiaOf and Register', () => {
	test('alxiaOf reads a server, an app, or BaseContext with neither', () => {
		const server = createServer({ configure });
		const typed = (context: RouterContextProvider) => {
			const name: string | undefined =
				alxiaOf<typeof server>(context).user?.name;
			// @ts-expect-error: nothing in the server derives `tenant`
			alxiaOf<typeof server>(context).tenant;
			// Unregistered in this program: BaseContext.
			const base: BaseContext = alxiaOf(context);
			// @ts-expect-error: BaseContext has no `user`
			alxiaOf(context).user;
			// @ts-expect-error: the type argument is a server or an app
			alxiaOf<{ create(): void }>(context);
			return { name, base };
		};
		expect(typed).toBeFunction();
	});

	test('Register names a server or an app; anything else makes every read an error', () => {
		const server = createServer({ configure });
		const typed = () => {
			const registered = {} as ContextOf<
				RegisteredOf<{ server: typeof server }>
			>;
			const name: string | undefined = registered.user?.name;
			const unregistered: BaseContext = {} as ContextOf<RegisteredOf<object>>;
			// The module rather than its default export: refused, not `never`.
			const wrong = {} as ContextOf<
				RegisteredOf<{ server: { default: typeof server } }>
			>;
			// @ts-expect-error: a wrong registration types no `user`
			wrong.user;
			// @ts-expect-error: nor anything assignable to what reads it
			const tenant: { a: number } = wrong.tenant;
			return { name, unregistered, tenant };
		};
		expect(typed).toBeFunction();
	});

	test("with no server registered, core's Register; a registered server wins", () => {
		const server = createServer({ configure });
		const base = alxia().derive(() => ({ tenant: 'acme' }));
		const typed = () => {
			const core = {} as ContextOf<RegisteredOf<object, typeof base>>;
			const tenant: string = core.tenant;
			const both = {} as ContextOf<
				RegisteredOf<{ server: typeof server }, typeof base>
			>;
			const name: string | undefined = both.user?.name;
			// @ts-expect-error: the server's app is read, not core's base
			both.tenant;
			return { tenant, name };
		};
		expect(typed).toBeFunction();
	});

	test('alxiaOf outside the catch-all says how to serve the app', () => {
		expect(() => alxiaOf(new RouterContextProvider())).toThrow(
			'add alxia() from @alxia/react-router/vite',
		);
	});

	test("unregistered here, alxiaOf reads core's Register", async () => {
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
