// The middleware model behind exported functions whose return types are
// inferred: a declaration build must name each one through `@alxia/core`.
import { alxia, defineMiddleware, responds, validate } from '@alxia/core';

const Ping = {
	'~standard': {
		version: 1,
		vendor: 'x',
		validate: (value: unknown) => ({ value: value as { interval: number } }),
	},
} as const;

// Middlewares, the model of 0.4: a middleware made once and exported names
// `Middleware` and `Next`; a route threading them, with its options, a
// `validate` and a `responds`, names what they add, declare and reply.
export const authed = defineMiddleware(({ request, reply }, next) =>
	request.headers.has('x-user')
		? next({ user: request.headers.get('x-user') ?? '' })
		: reply(401, { error: 'unauthorized' as const }),
);
export const owner = defineMiddleware<{ user: string }>()(
	async ({ user, reply }, next) =>
		user === 'root'
			? next({ owner: true as const })
			: reply(403, { error: 'forbidden' as const }),
);
export const timed = defineMiddleware(async (_ctx, next) => {
	const response = await next();
	response.headers.set('x-timed', '1');
	return response;
});

export function middlewares() {
	return alxia()
		.get('/me', timed, authed, owner, ({ user, owner: o, reply }) =>
			reply(200, { user, owner: o }),
		)
		.post(
			'/pings/:id',
			{ bodyLimit: 1024 },
			authed,
			validate({ body: Ping }),
			responds({ 201: Ping }),
			({ body, reply }) => reply(201, body),
		)
		.ws('/live', { send: Ping }, authed, {
			open: (socket) => void socket.send({ interval: socket.data.user.length }),
			message: () => {},
		});
}
