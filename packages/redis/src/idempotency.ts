import {
	type BaseContext,
	defineMiddleware,
	type Empty,
	type Middleware,
	type Reply,
	settle,
} from '@alxia/core';
import { bindIdempotency, defineIdempotency, GuardError } from '@nxgt/redis';
import { z } from 'zod';
import { nameUnder, type RedisTarget } from './handle';

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

const Stored = z.object({
	status: z.number().int(),
	headers: z.array(z.tuple([z.string(), z.string()])),
	body: z.string(),
});
type Stored = z.infer<typeof Stored>;

/** Headers a replay never repeats: a session cookie belongs to one response. */
const UNSTORED_HEADERS = new Set(['set-cookie', 'date', 'content-length']);

const KEY = /^[\x21-\x7e]{1,255}$/;

/** A response that is answered and not kept: a 5xx, a stream. */
class Unstored extends Error {
	readonly response: Response;
	constructor(response: Response) {
		super('unstored');
		this.response = response;
	}
}

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
 */
export function idempotency(
	target: RedisTarget,
	options: IdempotencyOptions,
): IdempotencyMiddleware {
	const { client, name } = nameUnder(target, options.name);
	const methods = new Set(options.methods ?? ['POST', 'PATCH']);
	const header = options.header ?? 'idempotency-key';
	const scope = options.scope ?? ((ctx: BaseContext) => ctx.ip);
	const bound = bindIdempotency(
		client,
		defineIdempotency({
			name,
			key: (key: string) => key,
			ttl: options.ttl ?? 86_400,
			...(options.lease === undefined ? {} : { lease: options.lease }),
			schema: Stored,
		}),
	);
	let warned = false;
	const warnUnscoped = () => {
		if (warned) return;
		warned = true;
		console.warn(unscopedWarning(options.name));
	};
	const refuse = (
		error: IdempotencyErrorBody['error'],
		retryAfter?: number,
	) => {
		const body: IdempotencyErrorBody =
			retryAfter === undefined ? { error } : { error, retryAfter };
		return body;
	};

	return defineMiddleware(async (ctx, next) => {
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

/** The warning a request with no scope prints, once per middleware. */
function unscopedWarning(name: string): string {
	return `idempotency "${name}": no client scope could be derived (ctx.ip is undefined and no scope option returned one), so these requests run unguarded, nothing stored or replayed. Pass a scope option, (ctx) => a user id, or an ip option to alxia().`;
}

/** What a key is bound to: the method, the path and query, the body. */
async function fingerprintOf(request: Request, url: URL): Promise<Uint8Array> {
	const body = new Uint8Array(await request.clone().arrayBuffer());
	const head = new TextEncoder().encode(
		`${request.method} ${url.pathname}${url.search}\n`,
	);
	const fingerprint = new Uint8Array(head.length + body.length);
	fingerprint.set(head);
	fingerprint.set(body, head.length);
	return fingerprint;
}

async function store(response: Response): Promise<Stored> {
	if (
		response.status >= 500 ||
		response.headers.get('content-type')?.startsWith('text/event-stream')
	) {
		throw new Unstored(response);
	}
	const headers: [string, string][] = [];
	for (const [name, value] of response.headers) {
		if (!UNSTORED_HEADERS.has(name)) headers.push([name, value]);
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	return {
		status: response.status,
		headers,
		body: Buffer.from(bytes).toString('base64'),
	};
}

function restore(stored: Stored, replayed: boolean): Response {
	const headers = new Headers(stored.headers);
	if (replayed) headers.set('idempotent-replayed', 'true');
	const body = Buffer.from(stored.body, 'base64');
	return new Response(
		stored.status === 204 || stored.status === 304 ? null : body,
		{ status: stored.status, headers },
	);
}
