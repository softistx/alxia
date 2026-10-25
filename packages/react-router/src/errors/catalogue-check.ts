import type { Held } from './catalogue-read';
import type { ApiMessages, CatalogueMessages } from './messages';

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

/** The TTL, whose getter is the app's: one that throws is logged and `fallback` is used. */
export function safeTtl(
	ttlMs: number | (() => number),
	fallback: number,
	log: Pick<Console, 'error'>,
) {
	return () => {
		try {
			return typeof ttlMs === 'function' ? ttlMs() : ttlMs;
		} catch (error) {
			log.error('alxia-react-router: ttlMs threw, using retryMs', error);
			return fallback;
		}
	};
}

/** A log whose `error` can throw without breaking what reports through it. */
export function quietLog(log: Pick<Console, 'error'>): Pick<Console, 'error'> {
	return {
		error: (...args) => {
			try {
				log.error(...args);
			} catch {
				// A broken log must not turn a handled failure into a rejection.
			}
		},
	};
}

/** The messages the browser words itself, by language. */
export function clientMessages<L extends string>(
	messages: ApiMessages<L>,
	languages: readonly L[],
	clientCodes: readonly string[],
) {
	const byLanguage = {} as Record<L, CatalogueMessages>;
	for (const language of languages) {
		const entries: Record<string, CatalogueMessages[string]> = {};
		for (const code of clientCodes) {
			const entry = messages.messageOf(language, code);
			if (entry) entries[code] = entry;
		}
		byLanguage[language] = entries;
	}
	return byLanguage;
}
