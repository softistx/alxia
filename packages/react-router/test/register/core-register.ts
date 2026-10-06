// `alxiaOf(context)` and `context.alxia` with no type argument and no server registered here,
// typed by the base `@alxia/core`'s `Register` names. A program of its own:
// the package's typecheck reads both `Register`s unregistered.
import { alxia } from '@alxia/core';
import { alxiaOf } from '@alxia/react-router';
import type { RouterContextProvider } from 'react-router';

const base = alxia().derive(() => ({ tenant: 'acme' }));

declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}

export function tenant(context: Readonly<RouterContextProvider>): string {
	return alxiaOf(context).tenant;
}

export function missing(context: Readonly<RouterContextProvider>) {
	// @ts-expect-error: the base derives no `user`
	return alxiaOf(context).user;
}

// `context.alxia` is typed through the same `Register`, with no call.
export function shorthand(context: Readonly<RouterContextProvider>) {
	const { tenant, server } = context.alxia;
	// @ts-expect-error: the base derives no `user`
	context.alxia.user;
	return { tenant, port: server?.port };
}
