// Every builder an app can be made of, behind exported functions whose
// return types are inferred: a declaration build must be able to name each
// one through `@alxia/core` alone (TS2883 otherwise).
import {
	alxia,
	type ClientErrorStatus,
	definePlugin,
	eventStream,
	problem,
	type RoutePath,
	type StandardSchemaV1,
} from '@alxia/core';

const Ping = {
	'~standard': {
		version: 1,
		vendor: 'x',
		validate: (value: unknown) => ({ value: value as { interval: number } }),
	},
} as const;

export function refusing() {
	return alxia()
		.derive(() => ({ user: 'u' }))
		.group('/jmap', (group) =>
			group
				.bodyLimit(1024)
				.onRefusal((r) =>
					r.kind === 'body_limit'
						? problem({
								type: 'urn:ietf:params:jmap:error:limit',
								status: 413,
								limit: 'maxSizeRequest',
							})
						: problem({
								type: 'urn:ietf:params:jmap:error:notRequest',
								status: 404,
							}),
				)
				.post('/', { body: Ping }, ({ reply }) => reply(200, { ok: true })),
		);
}

export function refusingMaybe() {
	return alxia()
		.onRefusal((r) =>
			r.kind === 'validation'
				? problem({ status: 400, detail: r.part })
				: undefined,
		)
		.get('/:id', { params: Ping }, ({ reply }) => reply(200, 'x'));
}

export function refusingWithSchemas() {
	return alxia().onRefusal(
		{ response: { 400: Ping }, contentType: 'application/problem+json' },
		(_refusal, { reply }) => reply(400, { interval: 1 }),
	);
}

// A hook per kind, one with schemas: each kind's marked replies, and the
// fallback of one that may return nothing, are named in the declaration.
export function refusingByKind() {
	return alxia()
		.onRefusal(
			'validation',
			{ response: { 422: Ping }, contentType: 'application/problem+json' },
			(_refusal, { reply }) => reply(422, { interval: 1 }),
		)
		.onRefusal('body_limit', (r) =>
			r.limit > 0 ? problem({ status: 413, limit: r.limit }) : undefined,
		)
		.post('/', { body: Ping, bodyLimit: 1024 }, ({ reply }) =>
			reply(200, { ok: true }),
		);
}

export function streaming() {
	const Push = eventStream({ ping: Ping });
	return alxia().get('/push', { response: { 200: Push } }, ({ reply }) =>
		reply(
			200,
			(async function* () {
				yield Push.event('ping', { interval: 1 });
			})(),
		),
	);
}

// The rest of the builders, and the generic forms most likely to keep an
// alias the declaration then has to name.
export function serving() {
	return alxia()
		.static('/assets', './public')
		.file('/favicon.ico', './favicon.ico')
		.decorate({ db: 'db' })
		.onError((_error, { reply }) => reply(500, { error: 'internal' as const }))
		.ws(
			'/rooms/:room',
			{ message: Ping, send: Ping },
			{
				message: (socket, ping) => socket.send(ping),
			},
		);
}

const tenant = definePlugin<{ user: string }>()((app) =>
	app.derive(({ user }) => ({ tenant: user.length })),
);

export function plugged() {
	return alxia()
		.derive(() => ({ user: 'u' }))
		.use(tenant)
		.get('/', ({ tenant: t, reply }) => reply(200, t));
}

// A path generic in `P` cannot be checked until `P` is known: the wrapper
// names it as the type argument, and the path's check is left to the app.
export function servedAt<const P extends RoutePath>(path: P) {
	return alxia().static<P>(path as never, './public');
}

export function typedBy<R extends StandardSchemaV1>(schema: R) {
	return alxia().get('/', { response: { 200: schema } }, ({ reply }) =>
		reply(200, {} as never),
	);
}

export function refusedWith<S extends ClientErrorStatus>(status: S) {
	return alxia().onRefusal(() => problem({ status }));
}

// The response's cookie map, carried in the context: `ResponseCookies`
// is named in the app's type.
export function withResponseCookies() {
	return alxia()
		.derive(({ cookies, set }) => ({ sid: cookies['sid'], jar: set.cookies }))
		.get('/', ({ sid, reply }) => reply(200, sid ?? ''));
}
