/** The methods of a `console` a report goes through. */
export type LogMethod = 'warn' | 'error';

/**
 * A log whose methods can throw without breaking what reports through
 * them: a broken app log must not turn a handled failure into a rejection.
 */
export function quietLog<M extends LogMethod>(
	log: Pick<Console, M>,
	methods: readonly M[],
): Pick<Console, M> {
	const quiet = {} as Pick<Console, M>;
	for (const method of methods) {
		quiet[method] = ((...args: unknown[]) => {
			try {
				(log[method] as (...args: unknown[]) => void)(...args);
			} catch {
				// Swallowed on purpose: see above.
			}
		}) as Pick<Console, M>[M];
	}
	return quiet;
}
