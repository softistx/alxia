import { checkVersions, safeTtl } from './catalogue-check';
import { type CatalogueReply, createCatalogueReader } from './catalogue-read';
import { quietLog } from './log';
import type { ApiMessages, CatalogueMessages } from './messages';

export type { CatalogueReply } from './catalogue-read';

export interface ErrorCatalogueOptions<L extends string> {
	/** The store the page words refusals from (`createApiMessages`). */
	messages: ApiMessages<L>;
	/** The languages to hold, each read once and kept fresh. */
	languages: readonly L[];
	/** Reads one language's catalogue from the API. */
	read(language: L): Promise<CatalogueReply>;
	/** Asks the API for the version of every language, in one call. */
	versions(): Promise<Partial<Record<L, string>>>;
	/** How long a held catalogue is served before its version is checked. */
	ttlMs: number | (() => number);
	/** How soon a check or a first read that failed is tried again. Default 5000. */
	retryMs?: number;
	/**
	 * How long a request waits for a language's first read; past it the
	 * request goes on and the read carries on in the background. Default 1500.
	 */
	firstReadWaitMs?: number;
	/** The codes the browser words itself (`clientMessages`). */
	clientCodes: readonly string[];
	/** Where failures are reported. Default `console`. */
	log?: Pick<Console, 'error'>;
}

/** The API's error catalogue, kept fresh for the server. */
export interface ErrorCatalogue<L extends string> {
	/**
	 * The catalogue of `language`, ready to word a refusal. Only a language
	 * with no catalogue yet is awaited, for at most `firstReadWaitMs`. A held
	 * one is served as it is, and once older than the TTL its version is
	 * checked in the background, one check at a time.
	 */
	fresh(language: L, now?: number): Promise<void>;
	/** Every language, fresh: what the root middleware awaits. */
	freshAll(now?: number): Promise<void>;
	/** At startup: reads every language without holding the boot back. */
	warm(): void;
	/** The messages the browser words itself, by language, for the root's loader. */
	clientMessages(): Record<L, CatalogueMessages>;
	/**
	 * Forgets everything held and in flight. For use between tests, with
	 * nothing in flight: a read or check still running when it is called
	 * finishes and holds its result again.
	 */
	reset(): void;
	/** The version held for a language, if any. */
	heldVersion(language: L): string | undefined;
	/** Waits for the check in flight, if any (tests). */
	settled(): Promise<void>;
}

/** The messages the browser words itself, by language. */
function clientMessages<L extends string>(
	messages: ApiMessages<L>,
	languages: readonly L[],
	clientCodes: readonly string[],
) {
	const byLanguage = {} as Record<L, CatalogueMessages>;
	for (const language of languages) {
		const entries: Record<string, CatalogueMessages[string]> =
			Object.create(null);
		for (const code of clientCodes) {
			const entry = messages.messageOf(language, code);
			if (entry) entries[code] = entry;
		}
		byLanguage[language] = entries;
	}
	return byLanguage;
}

/**
 * Keeps the API's error catalogue in `messages`: read on first use, checked
 * against the API's versions once per TTL, and re-read only for the
 * languages whose version moved. It is an instance, not module state.
 */
export function createErrorCatalogue<L extends string>({
	messages,
	languages,
	read,
	versions,
	ttlMs,
	retryMs = 5_000,
	firstReadWaitMs = 1_500,
	clientCodes,
	log: appLog = console,
}: ErrorCatalogueOptions<L>): ErrorCatalogue<L> {
	if (languages.length === 0) {
		throw new TypeError('createErrorCatalogue(): needs at least one language.');
	}
	const log = quietLog(appLog, ['error']);
	const ttl = safeTtl(ttlMs, retryMs, log);
	const reader = createCatalogueReader({
		messages,
		read,
		retryMs,
		firstReadWaitMs,
		log,
	});
	const context = { reader, versions, ttl, retryMs, log };
	let checking: Promise<void> | undefined;

	async function fresh(language: L, now: number = Date.now()) {
		const entry = reader.held.get(language);
		if (!entry) return reader.first(language, now);
		if (now - entry.checkedAt >= ttl() && !checking) {
			checking = checkVersions(context, now)
				.finally(() => {
					checking = undefined;
				})
				.catch(() => {});
		}
	}

	const freshAll = async (now: number = Date.now()) => {
		await Promise.all(languages.map((language) => fresh(language, now)));
	};

	return {
		fresh,
		freshAll,
		warm() {
			freshAll().catch((error) => {
				log.error(
					'alxia-react-router: the error catalogue was not warmed',
					error,
				);
			});
		},
		clientMessages: () => clientMessages(messages, languages, clientCodes),
		reset() {
			reader.reset();
			checking = undefined;
			messages.clear();
		},
		heldVersion: (language) => reader.held.get(language)?.version,
		settled: () => checking ?? Promise.resolve(),
	};
}
