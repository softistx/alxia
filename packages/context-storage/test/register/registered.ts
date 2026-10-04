// `contextStorage()` with no type argument, typed by the app `Register`
// names. A program of its own: the package's typecheck reads `Register`
// unregistered.
import { contextStorage } from '@alxia/context-storage';
import { alxia, defineRoutes } from '@alxia/core';

const base = alxia().derive(() => ({ user: { id: 'ada' } }));

declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}

const requestContext = contextStorage();

export function owner(): string {
	return requestContext.context().user.id;
}

export const app = base.plugin(requestContext);

// @ts-expect-error: an app that gives no `user` cannot use it
alxia().plugin(requestContext);

// Typed by a defineRoutes app, it reads that context, and the base gives it.
const routes = defineRoutes().get('/', ({ reply }) => reply(200, 'x'));
export const byRoutes = base.plugin(contextStorage<typeof routes>());
