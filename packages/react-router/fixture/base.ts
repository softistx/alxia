/**
 * The fixture's alxia app before the catch-all: what `app/server.ts`
 * configures, and what the runtime specs serve the build behind. A
 * function, so each spec gets an app of its own.
 */
import { alxia } from '@alxia/core';
import type { FreshApp } from '@alxia/react-router';

/**
 * `/api/health`, a `user` from the `x-user` header, and
 * three sockets: `/api/echo`, open to anyone, `/api/live`, subscribed to
 * what `routes/live.tsx`'s action publishes, and `/api/private`, refused
 * without a user.
 */
export const configure = (app: FreshApp) =>
	app
		.get('/api/health', ({ reply }) => reply.ok({ ok: true }))
		.derive(({ request }) => {
			const name = request.headers.get('x-user');
			return { user: name === null ? null : { name } };
		})
		.ws(
			'/api/echo',
			{},
			{
				open: (socket) =>
					socket.send({ hello: socket.data.user?.name ?? 'anonymous' }),
				message: (socket, message) => socket.send({ echo: String(message) }),
			},
		)
		.ws('/api/live', {
			open: (socket) => {
				socket.subscribe('live');
				socket.send({ subscribed: 'live' });
			},
			message: () => {},
		})
		.group((guarded) =>
			guarded
				.derive(({ user, reply }) =>
					user === null
						? reply(401, { error: 'unauthenticated' as const })
						: { user },
				)
				.ws(
					'/api/private',
					{},
					{
						open: (socket) => socket.send({ hello: socket.data.user.name }),
						message: () => {},
					},
				),
		);

export const makeBase = () => configure(alxia());

export type Base = ReturnType<typeof makeBase>;
