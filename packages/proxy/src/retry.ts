/**
 * When one request goes to another upstream: only when the one it tried
 * provably never received it. That is a connect that failed — refused, or
 * a host name that did not resolve — before a byte of the request left;
 * nothing else. A reset, a connection closed mid-request, a timeout or an
 * answer of any status is the upstream's, and is never retried: it may
 * have received the request, and a second upstream would run it twice.
 * A request with a body goes on only if the upstream never asked for a
 * chunk of it, so the body is still whole.
 */
import type { Plan } from './options';
import type { Pool } from './upstreams';

/**
 * The codes of a fetch that failed before connecting: Bun's
 * `ConnectionRefused` (`ECONNREFUSED` as Node names it), and the resolver's
 * `ENOTFOUND` and `EAI_AGAIN`.
 */
export const UNREACHED_CODES: ReadonlySet<string> = new Set([
	'ConnectionRefused',
	'ECONNREFUSED',
	'ENOTFOUND',
	'EAI_AGAIN',
]);

/** Whether `error`, what a fetch threw, says the connect failed before any byte left. */
export function neverReached(error: unknown): boolean {
	const code = (error as { code?: unknown } | null)?.code;
	return typeof code === 'string' && UNREACHED_CODES.has(code);
}

/**
 * Whether a WebSocket's close before its open says the connect itself
 * failed. Bun fires `error` then `close` with 1006 for any failure before
 * the open; from 1.4.4 on the close has no reason, and the `error` event's
 * `error.code` names a failed connect (`ECONNREFUSED`, `ENOTFOUND`) and
 * nothing for an upstream reached (`Expected 101 status code` when it
 * refused the upgrade). Up to 1.4.3 the close's reason said it: `Failed
 * to connect`, and another once the upstream was reached.
 */
export function socketNeverReached(close: CloseEvent, error?: Event): boolean {
	if (close.code !== 1006) return false;
	if (close.reason === 'Failed to connect') return true;
	return neverReached((error as { error?: unknown } | undefined)?.error);
}

/** An attempt that failed without reaching its upstream: `failure` answers it if no other upstream may be tried. */
export class Unreached {
	constructor(readonly failure: unknown) {}
}

/**
 * Runs `attempt` on the upstream the rotation picks, and on the next one
 * each time it throws `Unreached`, while the pool's `retries` allow, the
 * client is still there, and `replayable()` says the request can be sent
 * again. The upstream that failed to connect cools down; the one that
 * answers is back in the rotation. Any other error is thrown as it is.
 */
export async function acrossUpstreams<Ctx, T>(
	pool: Pool<Ctx>,
	signal: AbortSignal,
	replayable: () => boolean,
	attempt: (plan: Plan<Ctx>) => Promise<T>,
): Promise<T> {
	const tried = new Set<number>();
	let last: unknown;
	for (;;) {
		const index = pool.pick(tried);
		// Not reached while `more` below holds; kept so a change cannot answer a 500.
		if (index === undefined) throw last;
		tried.add(index);
		try {
			const value = await attempt(pool.plans[index] as Plan<Ctx>);
			pool.reached(index);
			return value;
		} catch (error) {
			if (!(error instanceof Unreached)) throw error;
			pool.failed(index);
			last = error.failure;
			const more = tried.size <= pool.retries && tried.size < pool.plans.length;
			if (!more || signal.aborted || !replayable()) throw error.failure;
		}
	}
}
