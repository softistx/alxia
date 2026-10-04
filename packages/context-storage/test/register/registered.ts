// `contextStorage()` with no type argument, typed by the app `Register`
// names. A program of its own: the package's typecheck reads `Register`
// unregistered.
import { contextStorage } from '@alxia/context-storage';
import { alxia } from '@alxia/core';

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

export const app = base.use(requestContext);

// @ts-expect-error: an app that gives no `user` cannot use it
alxia().use(requestContext);
