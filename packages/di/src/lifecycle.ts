import type { AnyAlxia, Plugin } from '@alxia/core';

/**
 * The plugin behind `deps.lifecycle`: keeps the servers the apps it was
 * given to started, and disposes of the Container when the last of them
 * stops.
 *
 * A fork takes its base's `onStart` and `onStop` and runs each once of its
 * own, so forks of a base given this plugin share the one Set. `onStop` is
 * given the server that stopped, or `undefined` on a `stop()` of an app that
 * never listened: a server the Set does not hold, or none, stops nothing of
 * ours. An app that listens again after a stop adds its new server, so a
 * restart is counted as a new start; the Container, once disposed of, stays
 * disposed (see the lifecycle guide).
 */
export function lifecycleOf(dispose: () => Promise<void>): Plugin {
	const serving = new Set<Bun.Server<unknown>>();
	return function lifecycle<App extends AnyAlxia>(app: App): App {
		return app
			.onStart((server) => {
				serving.add(server);
			})
			.onStop(async (server) => {
				if (server === undefined || !serving.delete(server)) return;
				if (serving.size === 0) await dispose();
			}) as App;
	};
}
