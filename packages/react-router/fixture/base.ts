/**
 * The fixture's alxia app before the catch-all: what its loaders read
 * through `alxiaOf<Base>`. A function, so each spec gets an app of its own.
 */
import { alxia } from '@alxia/core';

export const makeBase = () =>
	alxia()
		.get('/api/health', ({ reply }) => reply.ok({ ok: true }))
		.derive(({ request }) => {
			const name = request.headers.get('x-user');
			return { user: name === null ? null : { name } };
		});

export type Base = ReturnType<typeof makeBase>;
