/**
 * The process signals a served app shuts down on: one handler per signal
 * for the whole process, whichever apps and copies of core listen, so a
 * hundred `listen` calls add no hundred listeners. On the first signal,
 * every app listening for it shuts down, then the process exits: 0 when
 * each did, 1 when one failed. A second signal while they drain exits at
 * once, with 1. Unless the exit is not alxia's: an app listening with
 * `exit: false`, or another listener of the signal on the process — the
 * host's own cleanup — and alxia shuts its apps down and calls no
 * `process.exit`, a failure setting `process.exitCode` to 1.
 */

/** The signals `listen` shuts the app down on unless told otherwise. */
export const SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

interface Entry {
	readonly signals: readonly NodeJS.Signals[];
	readonly stop: () => Promise<void>;
	/** `listen`'s `exit`: whether alxia may end the process once it stopped. */
	readonly exit: boolean;
}

interface Registry {
	readonly entries: Set<Entry>;
	readonly handlers: Map<NodeJS.Signals, () => void>;
	/** Set by the first signal: the apps are draining. */
	draining: boolean;
	/** Set by the first signal: whether alxia exits once they drained. */
	exits: boolean;
}

const KEY = Symbol.for('alxia.signals');

function registry(): Registry {
	const global = globalThis as { [KEY]?: Registry };
	global[KEY] ??= {
		entries: new Set(),
		handlers: new Map(),
		draining: false,
		exits: false,
	};
	return global[KEY];
}

/**
 * Shuts an app down with `stop` on any of `signals`, then exits the
 * process when `exit` lets it; returns what removes it again, once the
 * app has stopped on its own.
 */
export function onSignals(
	signals: readonly NodeJS.Signals[],
	stop: () => Promise<void>,
	exit = true,
): () => void {
	const state = registry();
	const entry: Entry = { signals, stop, exit };
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
		if (!state.draining) prune(state);
	};
}

/** Removes the handler of each signal no app listens for any more. */
function prune(state: Registry): void {
	for (const [signal, handler] of state.handlers) {
		if ([...state.entries].some((e) => e.signals.includes(signal))) continue;
		process.off(signal, handler);
		state.handlers.delete(signal);
	}
}

function received(state: Registry, signal: NodeJS.Signals): void {
	if (state.draining) {
		if (state.exits) process.exit(1);
		return;
	}
	const entries = [...state.entries].filter((e) => e.signals.includes(signal));
	state.draining = true;
	// Ours is the only listener: none of the host's to let finish.
	state.exits =
		entries.every((entry) => entry.exit) && process.listenerCount(signal) <= 1;
	void Promise.allSettled(entries.map((entry) => entry.stop())).then(
		(results) => {
			let code = 0;
			for (const result of results) {
				if (result.status === 'rejected') {
					console.error(result.reason);
					code = 1;
				}
			}
			if (state.exits) process.exit(code);
			if (code !== 0) process.exitCode = code;
			state.draining = false;
			prune(state);
		},
	);
}
