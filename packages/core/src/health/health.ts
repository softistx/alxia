/**
 * `health()`: the liveness and readiness probes of an app, as a plugin
 * app given to `app.plugin`. Liveness answers while the process is up;
 * readiness runs the dependencies' checks, and answers 503 as soon as the
 * app starts shutting down.
 */

import { Alxia } from '../app/alxia';
import type { RouteDefinition } from '../app/definition';
import { markFactory } from '../app/factory';
import { shutdownSignal } from '../app/served';
import type { BaseContext, Empty } from '../app/types';
import type { RoutePath } from '../types/path';
import { type HealthCheck, type ReadinessReport, readiness } from './checks';

export interface HealthOptions {
	/**
	 * The dependencies readiness checks, by name: each passes when it
	 * returns or resolves, and fails when it throws, rejects, returns
	 * `false` or outlasts `timeout`. None by default: readiness is then
	 * the shutdown's alone.
	 */
	readonly checks?: Readonly<Record<string, HealthCheck>>;
	/** Where liveness answers: `/health` by default. */
	readonly path?: RoutePath;
	/** Where readiness answers: `/ready` by default. */
	readonly readyPath?: RoutePath;
	/** How long each check may take, in milliseconds: 1 000 by default. */
	readonly timeout?: number;
	/**
	 * How long a readiness report is kept, in milliseconds, for every probe
	 * that asks meanwhile: 1 000 by default; `0` runs the checks on each.
	 */
	readonly cache?: number;
}

/** What `GET /health` answers while the process is up. */
export interface LivenessReport {
	readonly status: 'ok';
}

/** Marks the handlers `health()` declares, for `isHealthRoute`: shared by every copy of core. */
const HEALTH: unique symbol = Symbol.for('alxia.health');

/**
 * The probes of an app, as a plugin: `GET /health`, liveness, answers 200
 * `{ status: 'ok' }` while the process is up; `GET /ready`, readiness,
 * runs every check at once, each within `timeout`, and answers 200, or
 * 503 with each check's status and duration, its report kept for `cache`
 * milliseconds. From the moment the app starts shutting down, readiness
 * answers 503 `{ status: 'shutting_down' }` without running a check.
 * Mount it before any guard, so that a probe needs no credentials:
 *
 * ```ts
 * const app = alxia()
 *   .plugin(health({ checks: { redis: () => redis.ping(), db: () => sql`select 1` } }))
 *   .use(bearer({ jwt }));
 * ```
 */
export function health(options: HealthOptions = {}): Alxia<Empty, ''> {
	const {
		checks = {},
		path = '/health',
		readyPath = '/ready',
		timeout = 1_000,
		cache = 1_000,
	} = options;
	for (const [name, value] of [
		['timeout', timeout],
		['cache', cache],
	] as const) {
		if (!(Number.isFinite(value) && value >= 0)) {
			throw new TypeError(
				`health(): ${name} must be a number of milliseconds, 0 or more; got ${String(value)}`,
			);
		}
	}
	const report = readiness(checks, timeout, cache);
	const live = marked(({ reply }: BaseContext) =>
		reply(200, { status: 'ok' } satisfies LivenessReport, NO_STORE),
	);
	const ready = marked(async (ctx: BaseContext) => {
		if (shutdownSignal(ctx).aborted) {
			const closing: ReadinessReport = { status: 'shutting_down', checks: {} };
			return ctx.reply(503, closing, NO_STORE);
		}
		const result = await report();
		return ctx.reply(result.status === 'ok' ? 200 : 503, result, NO_STORE);
	});
	const app = new Alxia() as unknown as {
		get(path: string, handler: unknown): unknown;
	};
	app.get(path, live);
	app.get(readyPath, ready);
	return app as unknown as Alxia<Empty, ''>;
}

/**
 * Whether `route` is one of `health()`'s probes, wherever mounted: what
 * `@alxia/openapi`'s `matchesSpec` reads to leave them out by itself, as
 * no operation of the document describes them.
 *
 * ```ts
 * const documented = app.routes.filter((route) => !isHealthRoute(route));
 * ```
 */
export function isHealthRoute(
	route: Pick<RouteDefinition, 'handler'>,
): boolean {
	return (route.handler as { [HEALTH]?: true })[HEALTH] === true;
}

/** A probe's answer is never cached by a proxy. */
const NO_STORE = { headers: { 'cache-control': 'no-store' } };

function marked<Handler extends object>(handler: Handler): Handler {
	(handler as { [HEALTH]?: true })[HEALTH] = true;
	return handler;
}

markFactory(health, 'plugin');
