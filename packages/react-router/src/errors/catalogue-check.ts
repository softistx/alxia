import type { Held } from './catalogue-read';

/** What the TTL check needs: the reader's state and the app's own calls. */
export interface CheckContext<L extends string> {
	reader: {
		held: Map<L, Held>;
		load(language: L, now: number): Promise<void>;
	};
	versions(): Promise<Partial<Record<L, string>>>;
	ttl(): number;
	retryMs: number;
	log: Pick<Console, 'error'>;
}

/**
 * Asks the versions in one call and reads again the messages of each
 * language that moved. An API that cannot be reached keeps the messages
 * held (stale, still worded) and is asked again after `retryMs`.
 */
export async function checkVersions<L extends string>(
	{ reader, versions, ttl, retryMs, log }: CheckContext<L>,
	now: number,
) {
	try {
		const latest = await versions();
		for (const [language, entry] of [...reader.held]) {
			if (latest[language] !== entry.version) {
				await reader.load(language, now);
			} else {
				entry.checkedAt = now;
			}
		}
	} catch (error) {
		log.error(
			'alxia-react-router: the error catalogue was not checked, keeping what is held',
			error,
		);
		for (const entry of reader.held.values()) {
			entry.checkedAt = now - ttl() + retryMs;
		}
	}
}

/**
 * The TTL, whose getter is the app's: one that throws, or that is not a
 * finite number of at least 0, is logged and `fallback` is used.
 */
export function safeTtl(
	ttlMs: number | (() => number),
	fallback: number,
	log: Pick<Console, 'error'>,
) {
	return () => {
		try {
			const ttl = typeof ttlMs === 'function' ? ttlMs() : ttlMs;
			if (typeof ttl === 'number' && Number.isFinite(ttl) && ttl >= 0) {
				return ttl;
			}
			log.error('alxia-react-router: ttlMs is not a duration, using retryMs');
		} catch (error) {
			log.error('alxia-react-router: ttlMs threw, using retryMs', error);
		}
		return fallback;
	};
}
