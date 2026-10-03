/**
 * A store that cannot answer is a miss, or keeps nothing: a cache is never
 * worth a 500. Said to the log once per outage — again only after the store
 * has answered since.
 */
export function storeGuard() {
	let failing = false;
	return async <T>(work: () => Promise<T> | T, fallback: T): Promise<T> => {
		try {
			const value = await work();
			failing = false;
			return value;
		} catch (error) {
			if (!failing) console.error(error);
			failing = true;
			return fallback;
		}
	};
}
