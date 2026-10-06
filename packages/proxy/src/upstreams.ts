/**
 * The upstreams of one proxy, fixed at declaration: one target or a list,
 * each checked as the single target always was, and the rotation over
 * them. Each request takes the next upstream round-robin, skipping one
 * that failed to connect less than `cooldown` ms ago; when every upstream
 * left is cooling down, the one that failed longest ago is tried rather
 * than none.
 */
import { type Plan, type ProxyOptions, planOf } from './options';

/** One upstream: an absolute URL, as a string or a `URL`. */
export type ProxyTarget = string | URL;

/** What `proxy()`, `proxy.mount()` and `proxy.ws()` forward to: one upstream, or several taken in turn. */
export type ProxyTargets = ProxyTarget | readonly ProxyTarget[];

/** The default `cooldown`, in milliseconds. */
export const COOLDOWN = 5_000;

/** The upstreams, their rotation and what each one's last connect did. */
export interface Pool<Ctx = unknown> {
	/** One plan per upstream, in the order given. */
	readonly plans: readonly Plan<Ctx>[];
	/** How many more upstreams one request may try after the first. */
	readonly retries: number;
	/** The next upstream for a request, among those it has not tried; `undefined` once it tried them all. */
	pick(tried: ReadonlySet<number>): number | undefined;
	/** Upstream `index` failed to connect: it cools down. */
	failed(index: number): void;
	/** Upstream `index` was reached: it is in the rotation again. */
	reached(index: number): void;
}

/** Checks every target and the pool's options once, where the proxy is declared. */
export function poolOf<Ctx>(
	where: string,
	targets: ProxyTargets,
	options: ProxyOptions<Ctx>,
	schemes?: readonly string[],
): Pool<Ctx> {
	const list: readonly ProxyTarget[] =
		typeof targets === 'string' || targets instanceof URL ? [targets] : targets;
	if (!Array.isArray(list) || list.length === 0) {
		throw new TypeError(
			`${where}: give one upstream URL, or a list of at least one; got ${Array.isArray(list) ? 'an empty list' : String(targets)}`,
		);
	}
	const plans = list.map((target) => planOf(where, target, options, schemes));
	const retries = wholeOf(where, 'retries', options.retries, list.length - 1);
	if (retries > list.length - 1) {
		throw new TypeError(
			`${where}: retries must be at most the number of upstreams − 1 (${list.length - 1}), each tried once per request; got ${retries}`,
		);
	}
	const cooldown = wholeOf(where, 'cooldown', options.cooldown, COOLDOWN);
	return rotation(plans, retries, cooldown);
}

/** The round-robin over `plans`, with the cooldown of each. */
function rotation<Ctx>(
	plans: readonly Plan<Ctx>[],
	retries: number,
	cooldown: number,
): Pool<Ctx> {
	/** When each upstream last failed to connect, while it has not been reached since. */
	const failedAt: (number | undefined)[] = plans.map(() => undefined);
	let cursor = 0;
	const take = (index: number) => {
		cursor = (index + 1) % plans.length;
		return index;
	};
	return {
		plans,
		retries,
		pick(tried) {
			const now = performance.now();
			let oldest: number | undefined;
			for (let step = 0; step < plans.length; step++) {
				const index = (cursor + step) % plans.length;
				if (tried.has(index)) continue;
				const at = failedAt[index];
				if (at === undefined || now - at >= cooldown) return take(index);
				const best = oldest === undefined ? undefined : failedAt[oldest];
				if (best === undefined || at < best) oldest = index;
			}
			return oldest === undefined ? undefined : take(oldest);
		},
		failed(index) {
			failedAt[index] = performance.now();
		},
		reached(index) {
			failedAt[index] = undefined;
		},
	};
}

function wholeOf(
	where: string,
	option: string,
	value: number | undefined,
	fallback: number,
): number {
	if (value === undefined) return fallback;
	if (!(Number.isSafeInteger(value) && value >= 0)) {
		throw new TypeError(
			`${where}: ${option} must be a whole number, 0 or more; got ${String(value)}`,
		);
	}
	return value;
}
