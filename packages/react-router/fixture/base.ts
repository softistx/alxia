/**
 * The fixture's alxia app before the catch-all: what `app/server.ts`
 * configures, and what the runtime specs serve the build behind. A
 * function, so each spec gets an app of its own.
 */
import { alxia } from '@alxia/core';
import type { FreshApp } from '@alxia/react-router';

/** `/api/health`, and a `user` from the `x-user` header. */
export const configure = (app: FreshApp) =>
	app
		.get('/api/health', ({ reply }) => reply.ok({ ok: true }))
		.derive(({ request }) => {
			const name = request.headers.get('x-user');
			return { user: name === null ? null : { name } };
		});

export const makeBase = () => configure(alxia());

export type Base = ReturnType<typeof makeBase>;
