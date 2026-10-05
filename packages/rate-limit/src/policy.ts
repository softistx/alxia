import type { Policy, RateLimitStore } from './store';

/** What `resolvePolicy` reads: the numbers an app gave, and the store they count in. */
interface Given {
	readonly limit?: number | undefined;
	readonly windowMs?: number | undefined;
	readonly store?: RateLimitStore | undefined;
}

/**
 * The policy a limit counts and writes its headers by: the app's `limit`
 * and `windowMs`, or the store's own `policy` where it has one. A number
 * that differs from the store's is an error at declaration, since the
 * headers would say what the store does not do.
 */
export function resolvePolicy(given: Given): Policy {
	const own = given.store?.policy;
	const policy: Policy = {
		limit: given.limit ?? own?.limit ?? Number.NaN,
		windowMs: given.windowMs ?? own?.windowMs ?? Number.NaN,
	};
	for (const name of ['limit', 'windowMs'] as const) {
		const value = policy[name];
		if (!Number.isSafeInteger(value) || value < 1) {
			// 0 refuses every request; a window of 0 or less never ends one.
			throw new TypeError(
				`rateLimit: ${name} must be a whole number of 1 or more, not ${String(given[name] ?? own?.[name])}`,
			);
		}
	}
	if (own !== undefined) {
		for (const name of ['limit', 'windowMs'] as const) {
			if (policy[name] !== own[name]) {
				throw new TypeError(
					`rateLimit: ${name} ${policy[name]} differs from the store's policy of ${own.limit} per ${own.windowMs}ms. Leave limit and windowMs out to use the store's, or give the same numbers.`,
				);
			}
		}
	}
	return policy;
}
