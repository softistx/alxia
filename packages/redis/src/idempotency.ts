import {
	type BaseContext,
	defineMiddleware,
	type Empty,
	type Middleware,
	markFactory,
	type Reply,
	settle,
} from '@alxia/core';
import {
	type BoundIdempotency,
	bindIdempotency,
	defineIdempotency,
	GuardError,
} from '@nxgt/redis';
import { isWiredIdempotency, nameUnder, type RedisTarget } from './handle';
import {
	fingerprintOf,
	type IdempotencyResult,
	idempotencyResult,
	restore,
	store,
	Unstored,
} from './idempotency-response';

export interface IdempotencyOptions {
	/** Names the keys it stores, under a handle's prefix when it is given one. */
	readonly name: string;
	/** Seconds a finished response is kept and replayed. A day by default. */
	readonly ttl?: number;
	/** Milliseconds a running request holds its key unless renewed. `@nxgt/redis`'s 10 s by default. */
	readonly lease?: number;
	/** Milliseconds a repeat waits for the first to finish before a 409. None by default. */
	readonly wait?: number;
	/** The methods it guards. `POST` and `PATCH` by default: the others are idempotent already. */
	readonly methods?: readonly string[];
	/** The header the key is read from. `Idempotency-Key` by default. */
	readonly header?: string;
	/** Whether a guarded request without a key is refused, with a 400. Off by default. */
	readonly required?: boolean;
	/**
	 * Whose key it is: keys are scoped by the route and by this, so two
	 * clients choosing the same key never see each other's response. The
	 * client's address by default; a user id when there is one. A request
	 * it gives no scope for runs unguarded — nothing stored, nothing
	 * replayed — with a warning, once.
	 */
	readonly scope?: (ctx: BaseContext) => string | undefined;
}

/** The body of a refusal. */
export interface IdempotencyErrorBody {
	readonly error:
		| 'idempotency_key_missing'
		| 'idempotency_key_invalid'
		| 'idempotency_in_progress'
		| 'idempotency_key_reused';
	/** Seconds until a running request should be over: with `idempotency_in_progress`. */
	readonly retryAfter?: number;
}

/**
 * What `idempotency()` makes: a middleware that adds nothing to the
 * context, and may answer a 400, a 409 or a 422.
 */
export type IdempotencyMiddleware = Middleware<
	Empty,
	Promise<
		| Response
		| Reply<400, IdempotencyErrorBody>
		| Reply<409, IdempotencyErrorBody>
		| Reply<422, IdempotencyErrorBody>
	>
>;

/**
 * An idempotency wired by `defineRedis` — `handle.idempotency.orders` — whose
 * definition holds `idempotencyResult` as its schema and a key taken as a
 * string.
 */
export type WiredIdempotency = BoundIdempotency<
	string,
	IdempotencyResult,
	IdempotencyResult
>;

/** What a wired idempotency leaves to the middleware: its name, `ttl` and `lease` are the definition's. */
export type WiredIdempotencyOptions = Omit<
	IdempotencyOptions,
	'name' | 'ttl' | 'lease'
>;

const KEY = /^[\x21-\x7e]{1,255}$/;

/**
 * Idempotent routes, as a middleware, with `@nxgt/redis`: a `POST` or
 * `PATCH` carrying an `Idempotency-Key` runs once per key, and every repeat
 * gets the first response back, marked `Idempotent-Replayed: true` — across
 * every process sharing the Redis. Routes declared after it are guarded; a
 * request no route matches is not: there is no route to scope its key by.
 * What is kept is the response the route answers, an error's answer
 * included.
 *
 * A repeat while the first still runs is a 409, and the same key with
 * another request — method, path or body — a 422: both are part of every
 * guarded route's type. A 5xx, or a stream, is answered and not kept: the
 * key is free again.
 *
 * ```ts
 * app.use(idempotency(redis.client, { name: 'payments' })).post('/payments', ...);
 * ```
 *
 * Given an `@nxgt/redis` handle instead of a client, the keys are under the
 * handle's `prefix`: `idempotency(handle, { name: 'payments' })`.
 *
 * Given an idempotency wired by `defineRedis`, the definition — name, `ttl`,
 * `lease` — is the one place, and the keys are those `@nxgt/redis` writes,
 * `<prefix>:<name>:<route>:<scope>:<key>`:
 *
 * ```ts
 * app.use(idempotency(handle.idempotency.orders, { required: true })).post('/orders', ...);
 * ```
 */
export function idempotency(
	target: RedisTarget,
	options: IdempotencyOptions,
): IdempotencyMiddleware;
export function idempotency(
	wired: WiredIdempotency,
	options?: WiredIdempotencyOptions,
): IdempotencyMiddleware;
export function idempotency(
	target: RedisTarget | WiredIdempotency,
	options: IdempotencyOptions | WiredIdempotencyOptions = {},
): IdempotencyMiddleware {
	const { bound, label } = isWiredIdempotency(target)
		? wiredOf(target, options)
		: boundOf(target, options as IdempotencyOptions);
	const methods = new Set(options.methods ?? ['POST', 'PATCH']);
	const header = options.header ?? 'idempotency-key';
	const scope = options.scope ?? ((ctx: BaseContext) => ctx.ip);
	let warned = false;
	const warnUnscoped = () => {
		if (warned) return;
		warned = true;
		console.warn(unscopedWarning(label()));
	};

	return defineMiddleware(async function idempotency(ctx, next) {
		const { request, reply, route } = ctx;
		if (route === undefined || !methods.has(request.method)) return next();
		const key = request.headers.get(header);
		if (key === null) {
			return options.required
				? reply(400, refuse('idempotency_key_missing'))
				: next();
		}
		if (!KEY.test(key)) return reply(400, refuse('idempotency_key_invalid'));

		const scoped = scope(ctx);
		if (scoped === undefined) {
			warnUnscoped();
			return next();
		}
		const id = `${route}:${scoped}:${key}`;
		const fingerprint = await fingerprintOf(request, ctx.url);

		try {
			const { value, replayed } = await bound.run(
				id,
				async () => store(await settle(ctx, next())),
				{
					fingerprint,
					...(options.wait === undefined ? {} : { wait: options.wait }),
				},
			);
			return restore(value, replayed);
		} catch (error) {
			if (error instanceof Unstored) return error.response;
			if (error instanceof GuardError && error.code === 'IN_PROGRESS') {
				const retryAfter = Math.max(
					1,
					Math.ceil((error.retryAfter ?? 0) / 1000),
				);
				return reply(409, refuse('idempotency_in_progress', retryAfter), {
					headers: { 'retry-after': String(retryAfter) },
				});
			}
			if (error instanceof GuardError && error.code === 'MISMATCH') {
				return reply(422, refuse('idempotency_key_reused'));
			}
			throw error;
		}
	});
}

function refuse(
	error: IdempotencyErrorBody['error'],
	retryAfter?: number,
): IdempotencyErrorBody {
	return retryAfter === undefined ? { error } : { error, retryAfter };
}

/** The idempotency bound from a client or a handle: the keys are `<prefix>:<name>:<id>`. */
function boundOf(target: RedisTarget, options: IdempotencyOptions) {
	const { client, name } = nameUnder(target, options.name);
	const bound = bindIdempotency(
		client,
		defineIdempotency({
			name,
			key: (key: string) => key,
			ttl: options.ttl ?? 86_400,
			...(options.lease === undefined ? {} : { lease: options.lease }),
			schema: idempotencyResult,
		}),
	);
	return { bound: bound as WiredIdempotency, label: () => options.name };
}

/** The idempotency wired by `defineRedis`, which carries its own name, `ttl` and `lease`. */
function wiredOf(wired: WiredIdempotency, options: object) {
	for (const own of ['name', 'ttl', 'lease']) {
		if (own in options) {
			throw new TypeError(
				`idempotency: "${own}" is the wired definition's, set in defineIdempotency: the middleware takes none with a wired idempotency`,
			);
		}
	}
	const label = () => {
		try {
			return wired.keyFor('').replace(/:$/, '');
		} catch {
			return 'wired';
		}
	};
	return { bound: wired, label };
}

/** The warning a request with no scope prints, once per middleware. */
function unscopedWarning(name: string): string {
	return `idempotency "${name}": no client scope could be derived (ctx.ip is undefined and no scope option returned one), so these requests run unguarded, nothing stored or replayed. Pass a scope option, (ctx) => a user id, or an ip option to alxia().`;
}

markFactory(idempotency);
