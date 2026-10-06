// Every builder an app can be made of, behind exported functions whose
// return types are inferred: a declaration build must be able to name each
// one through `@alxia/core` alone (TS2883 otherwise).
import {
	alxia,
	type ClientErrorStatus,
	defineMiddleware,
	definePlugin,
	type Empty,
	errorFormat,
	eventStream,
	health,
	type PathAt,
	problem,
	problemOf,
	type RoutePath,
	refusalOf,
	responds,
	type StandardSchemaV1,
	type StaticPath,
	sseComment,
	validate,
} from '@alxia/core';

const Ping = {
	'~standard': {
		version: 1,
		vendor: 'x',
		validate: (value: unknown) => ({ value: value as { interval: number } }),
	},
} as const;

// A refusal answered by a try/catch middleware reading `refusalOf`: its
// replies, by kind, are named in the declaration.
export function refusing() {
	return alxia()
		.derive(() => ({ user: 'u' }))
		.group('/jmap', (group) =>
			group
				.bodyLimit(1024)
				.use(async (_ctx, next) => {
					try {
						return await next();
					} catch (error) {
						const refusal = refusalOf(error);
						if (refusal === undefined) throw error;
						return refusal.kind === 'body_limit'
							? problem({
									type: 'urn:ietf:params:jmap:error:limit',
									status: 413,
									limit: 'maxSizeRequest',
								})
							: problem({
									type: 'urn:ietf:params:jmap:error:notRequest',
									status: 404,
								});
					}
				})
				.post('/', validate({ body: Ping }), ({ reply }) =>
					reply(200, { ok: true }),
				),
		);
}

export function streaming() {
	const Push = eventStream({ ping: Ping });
	return alxia().get('/push', responds({ 200: Push }), ({ reply }) =>
		reply(
			200,
			(async function* () {
				yield sseComment('connected');
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
		.use(async ({ reply }, next) => {
			try {
				return await next();
			} catch {
				return reply(500, { error: 'internal' as const });
			}
		})
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
		.plugin(tenant)
		.get('/', ({ tenant: t, reply }) => reply(200, t));
}

// A path generic in `P` is checked where `P` is known: the wrapper's
// parameter carries the check of the method it forwards to.
export function servedAt<const P extends RoutePath>(
	path: PathAt<'', P, StaticPath<P>>,
) {
	return alxia().static(path, './public');
}

export function routedAt<const P extends RoutePath>(path: PathAt<'', P>) {
	return alxia().get(path, ({ reply }) => reply(200, 'x'));
}

export const served = servedAt('/assets');
export const routed = routedAt('/pets/:id');

export function typedBy<R extends StandardSchemaV1>(schema: R) {
	return alxia().get('/', responds({ 200: schema }), ({ reply }) =>
		reply(200, {} as never),
	);
}

export function refusedWith<S extends ClientErrorStatus>(status: S) {
	return alxia().use(async (_ctx, next) => {
		try {
			return await next();
		} catch (error) {
			if (refusalOf(error) === undefined) throw error;
			return problem({ status });
		}
	});
}

// The response's cookie map, carried in the context: `ResponseCookies`
// is named in the app's type.
export function withResponseCookies() {
	return alxia()
		.derive(({ cookies, set }) => ({ sid: cookies['sid'], jar: set.cookies }))
		.get('/', ({ sid, reply }) => reply(200, sid ?? ''));
}

// Middlewares given to a route after its path, made once and exported:
// a route threading them names what they add and reply in its record.
export const canSee = defineMiddleware<{
	user: string;
	params: { id: string };
}>()(({ user, params, reply }, next) =>
	user === params.id ? next() : reply(403, { error: 'forbidden' as const }),
);
export const loaded = defineMiddleware<{ params: { id: string } }>()(
	({ params }, next) => next({ loadedAt: params.id }),
);
export const busy = defineMiddleware<Empty>()(({ reply }) =>
	reply(409, { error: 'busy' as const }),
);

export function hooked() {
	return alxia()
		.derive(() => ({ user: 'u' }))
		.get('/:id', canSee, loaded, ({ loadedAt, reply }) =>
			reply(200, loadedAt ?? ''),
		)
		.post('/:id', busy, validate({ body: Ping }), ({ body, reply }) =>
			reply(200, body),
		)
		.all('/any/:id', canSee, loaded, ({ loadedAt, reply }) =>
			reply(200, loadedAt ?? ''),
		)
		.route(
			{ method: 'PUT', path: '/:id', schema: { body: Ping } } as const,
			canSee,
			({ reply }) => reply(204),
		)
		.ws('/live/:id', canSee, loaded, {
			open: (socket) => void socket.send(socket.data.loadedAt ?? ''),
			message: () => {},
		});
}

// The app's methods taken as values: each is typed by an interface of its
// own, which a declaration names through `@alxia/core`.
export function methods() {
	const app = alxia().derive(() => ({ user: 'u' }));
	return {
		get: app.get,
		all: app.all,
		ws: app.ws,
		static: app.static,
		file: app.file,
		page: app.page,
		decorate: app.decorate,
		derive: app.derive,
		bodyLimit: app.bodyLimit,
		onStart: app.onStart,
		onStop: app.onStop,
		parser: app.parser,
		group: app.group,
		plugin: app.plugin,
		use: app.use,
		request: app.request,
		listen: app.listen,
	};
}

// Problem details: a middleware answering in the app's format, behind the
// probes of `health()`, on an app that answers its own errors as problems.
export function problems() {
	return alxia({ errors: 'problem' })
		.plugin(health({ checks: { db: () => true } }))
		.use((ctx, next) =>
			ctx.request.headers.has('x-quota')
				? errorFormat(ctx) === 'problem'
					? problem(
							problemOf(ctx, { status: 429, detail: 'Over quota', quota: 3 }),
						)
					: ctx.reply(429, { error: 'quota' as const })
				: next(),
		)
		.get('/ok', ({ reply }) => reply(200));
}
