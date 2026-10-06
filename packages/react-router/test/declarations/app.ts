// A React Router server, the app it makes and what its loaders read, behind
// exported values whose types are inferred: a declaration build must be able
// to name each one through `@alxia/react-router`, `@alxia/core` and
// `react-router` alone (TS2883 otherwise).
//
// `Register` is not augmented here: this file is in the package's own
// typecheck, whose specs read `alxiaOf(context)` unregistered. `RegisteredOf`
// is what the augmentation resolves through, so it is named instead.
import { type AnyAlxia, alxia } from '@alxia/core';
import {
	alxiaOf,
	createServer,
	type FreshApp,
	nonceOf,
	type RegisteredOf,
	reactRouter,
} from '@alxia/react-router';
import type { RouterContextProvider, ServerBuild } from 'react-router';

declare const build: ServerBuild;
declare const context: Readonly<RouterContextProvider>;

const server = createServer({
	beforeAll: (app) => app.derive(() => ({ requestId: 'r' })),
	configure: (app) =>
		app
			.derive(() => ({ user: { name: 'Ada' } as { name: string } | null }))
			.post('/api/todos', ({ reply }) => reply(201, { id: 1 })),
	getLoadContext: ({ user }) => {
		void user;
	},
});

export default server;

export function served() {
	return server;
}

export function made() {
	return server.create({ build });
}

export function fresh() {
	return createServer();
}

export function loaderContext() {
	return alxiaOf<typeof server>(context);
}

export function registeredContext() {
	return alxiaOf<RegisteredOf<{ server: typeof server }>>(context);
}

// The server serving the request, core's `ctx.server`, through `alxiaOf`.
export function loaderServer() {
	return alxiaOf<typeof server>(context).server;
}

export function behind() {
	const base = alxia().derive(() => ({ tenant: 't' }));
	return reactRouter(base, {
		build,
		getLoadContext: ({ tenant }) => {
			void tenant;
		},
	});
}

export function serverOf<App extends AnyAlxia>(
	configure: (app: FreshApp) => App,
) {
	return createServer({ configure });
}

export function entryNonce() {
	return nonceOf(context);
}
