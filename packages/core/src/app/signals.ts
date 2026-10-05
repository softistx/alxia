/**
 * The process signals a served app shuts down on: one handler per signal
 * for the whole process, whichever apps and copies of core listen, so a
 * hundred `listen` calls add no hundred listeners. On the first signal,
 * every app listening for it shuts down, then the process exits: 0 when
 * each did, 1 when one failed. A second signal while they drain exits at
 * once, with 1.
 */

/** The signals `listen` shuts the app down on unless told otherwise. */
export const SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

interface Entry {
	readonly signals: readonly NodeJS.Signals[];
	readonly stop: () => Promise<void>;
}

interface Registry {
	readonly entries: Set<Entry>;
	readonly handlers: Map<NodeJS.Signals, () => void>;
	/** Set by the first signal: the apps are draining. */
	draining: boolean;
}

const KEY = Symbol.for('alxia.signals');

function registry(): Registry {
	const global = globalThis as { [KEY]?: Registry };
	global[KEY] ??= { entries: new Set(), handlers: new Map(), draining: false };
	return global[KEY];
}

/**
 * Shuts an app down with `stop` on any of `signals`; returns what removes
 * it again, once the app has stopped on its own.
 */
export function onSignals(
	signals: readonly NodeJS.Signals[],
	stop: () => Promise<void>,
): () => void {
	const state = registry();
	const entry: Entry = { signals, stop };
	state.entries.add(entry);
	for (const signal of signals) {
		if (state.handlers.has(signal)) continue;
		const handler = () => received(state, signal);
		state.handlers.set(signal, handler);
		process.on(signal, handler);
	}
	return () => {
		state.entries.delete(entry);
		// Draining: the handlers stay, so a second signal still exits at once.
		if (state.draining) return;
		for (const [signal, handler] of state.handlers) {
			if ([...state.entries].some((e) => e.signals.includes(signal))) continue;
			process.off(signal, handler);
			state.handlers.delete(signal);
		}
	};
}

function received(state: Registry, signal: NodeJS.Signals): void {
	if (state.draining) process.exit(1);
	state.draining = true;
	const stopping = [...state.entries]
		.filter((entry) => entry.signals.includes(signal))
		.map((entry) => entry.stop());
	void Promise.allSettled(stopping).then((results) => {
		let code = 0;
		for (const result of results) {
			if (result.status === 'rejected') {
				console.error(result.reason);
				code = 1;
			}
		}
		process.exit(code);
	});
}
