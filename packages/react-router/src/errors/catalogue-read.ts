import type { ApiMessages, CatalogueMessage } from './messages';

/** What the API answers for one language: its version and every message. */
export type CatalogueReply = {
	version: string;
	messages: ReadonlyArray<CatalogueMessage & { readonly code: string }>;
};

/** A language's catalogue as held, and when its version was last confirmed. */
export type Held = { version: string; checkedAt: number };

export interface CatalogueReaderOptions<L extends string> {
	messages: ApiMessages<L>;
	read(language: L): Promise<CatalogueReply>;
	retryMs: number;
	firstReadWaitMs: number;
	log: Pick<Console, 'error'>;
}

/**
 * Waits for the read, until `firstReadWaitMs` after it started (not after
 * this request came: a hung API holds a request at most that long in
 * all); the read goes on either way.
 */
async function boundedWait(
	pending: { read: Promise<void>; started: number },
	firstReadWaitMs: number,
) {
	const left = firstReadWaitMs - (performance.now() - pending.started);
	if (left <= 0) return;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const limit = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, left);
	});
	await Promise.race([pending.read, limit]);
	clearTimeout(timer);
}

/**
 * The reading half of the catalogue: the first read of each language (one in
 * flight, a bounded wait, a retry delay after a failure) and the version
 * each one holds. `createErrorCatalogue` adds the TTL check on top.
 */
export function createCatalogueReader<L extends string>({
	messages,
	read,
	retryMs,
	firstReadWaitMs,
	log,
}: CatalogueReaderOptions<L>) {
	const held = new Map<L, Held>();
	const loading = new Map<L, { read: Promise<void>; started: number }>();
	const failedAt = new Map<L, number>();

	/** Reads one language's messages and holds them. */
	async function load(language: L, now: number) {
		const reply = await read(language);
		const entries: Record<string, CatalogueMessage> = Object.create(null);
		for (const { code, message, params } of reply.messages) {
			entries[code] = { message, params };
		}
		messages.set(language, entries);
		held.set(language, { version: reply.version, checkedAt: now });
	}

	/** The first read of a language, once however many pages ask at the same time. */
	function loadOnce(language: L, now: number) {
		let pending = loading.get(language);
		if (!pending) {
			const started = performance.now();
			const reading = load(language, now)
				.then(() => {
					failedAt.delete(language);
				})
				.catch((error) => {
					// When it failed, not when it started: a read that hung for
					// the wait is not retried at once by the next request.
					failedAt.set(language, now + (performance.now() - started));
					log.error(
						`alxia-react-router: the error catalogue (${language}) was not read`,
						error,
					);
				})
				.finally(() => {
					loading.delete(language);
				});
			pending = { read: reading, started };
			loading.set(language, pending);
		}
		return pending;
	}

	return {
		held,
		load,
		/** Reads a language that is not held yet, unless a failure is still fresh. */
		async first(language: L, now: number) {
			const failed = failedAt.get(language);
			if (failed === undefined || now - failed >= retryMs) {
				await boundedWait(loadOnce(language, now), firstReadWaitMs);
			}
		},
		reset() {
			held.clear();
			loading.clear();
			failedAt.clear();
		},
	};
}
