/**
 * The readiness checks `health()` runs: each with a timeout, all at once,
 * their report kept for a short while and shared by the probes that ask
 * meanwhile, so that probes do not hammer the dependencies. A check that
 * outlasted its timeout is not started again while it still runs: the
 * probes after it wait on the same run, so a hung dependency gathers no
 * pile of calls.
 */

/**
 * A dependency's check: it passes when it returns or resolves, and fails
 * when it throws, rejects, returns `false` or outlasts the timeout.
 * `() => redis.ping()`, `` () => sql`select 1` ``.
 */
export type HealthCheck = () => unknown;

/** One check's result: `ok` or `down`, how long it took, and why it is down. */
export interface CheckResult {
	readonly status: 'ok' | 'down';
	/** Milliseconds, rounded. */
	readonly duration: number;
	/** Why it is down: it outlasted the timeout, or it failed. Never its error, which may say too much. */
	readonly reason?: 'timeout' | 'failed';
}

/** What `GET /ready` answers: `ok` with a 200, `down` or `shutting_down` with a 503. */
export interface ReadinessReport {
	readonly status: 'ok' | 'down' | 'shutting_down';
	/** Each check's result, by name; none while shutting down. */
	readonly checks: Readonly<Record<string, CheckResult>>;
}

/** The checks run, their report kept for `cache` milliseconds once made. */
export function readiness(
	checks: Readonly<Record<string, HealthCheck>>,
	timeout: number,
	cache: number,
): () => Promise<ReadinessReport> {
	// `at` is when the report was made: never passed while it is being made,
	// so the probes that ask meanwhile share it.
	let last:
		| { at: number; readonly report: Promise<ReadinessReport> }
		| undefined;
	return () => {
		if (last === undefined || performance.now() - last.at >= cache) {
			const made = {
				at: Number.POSITIVE_INFINITY,
				report: runAll(checks, timeout),
			};
			void made.report.then(() => {
				made.at = performance.now();
			});
			last = made;
		}
		return last.report;
	};
}

/** The run of each check still pending, by check: reused rather than started again. */
const pending = new WeakMap<HealthCheck, Promise<'ok' | 'failed'>>();

/** `check` run, or its run still pending joined: `ok`, or `failed` when it throws, rejects or returns `false`. */
function runOf(check: HealthCheck): Promise<'ok' | 'failed'> {
	let run = pending.get(check);
	if (run !== undefined) return run;
	run = (async () => {
		try {
			return (await check()) === false ? 'failed' : 'ok';
		} catch {
			return 'failed';
		} finally {
			pending.delete(check);
		}
	})();
	// `finally` runs after this: `await check()` defers it at least a tick.
	pending.set(check, run);
	return run;
}

async function runAll(
	checks: Readonly<Record<string, HealthCheck>>,
	timeout: number,
): Promise<ReadinessReport> {
	const names = Object.keys(checks);
	const results = await Promise.all(
		names.map((name) => runOne(checks[name] as HealthCheck, timeout)),
	);
	const report: Record<string, CheckResult> = {};
	names.forEach((name, index) => {
		report[name] = results[index] as CheckResult;
	});
	const ok = results.every((result) => result.status === 'ok');
	return { status: ok ? 'ok' : 'down', checks: report };
}

async function runOne(
	check: HealthCheck,
	timeout: number,
): Promise<CheckResult> {
	const start = performance.now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<'timeout'>((resolve) => {
		timer = setTimeout(() => resolve('timeout'), timeout);
	});
	const outcome = await Promise.race([runOf(check), late]);
	clearTimeout(timer);
	const duration = Math.round(performance.now() - start);
	return outcome === 'ok'
		? { status: 'ok', duration }
		: { status: 'down', duration, reason: outcome };
}
