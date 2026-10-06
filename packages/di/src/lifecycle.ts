import type { AnyAlxia, Plugin } from '@alxia/core';

/** The servers started under each Container, shared by every `di()` over it. */
const started = new WeakMap<object, Set<Bun.Server<unknown>>>();

/**
 * The plugin behind `deps.lifecycle`: keeps the servers the apps it was
 * given to started, in one Set per Container, and disposes of the Container
 * when the last of them stops.
 *
 * The Set is keyed by the Container, so two `di()` calls over one Container
 * count together: an app stopping under one leaves the Container to an app
 * still serving under the other. A fork takes its base's `onStart` and
 * `onStop` and runs each once of its own, so forks share the Set too. `onStop`
 * is given the server that stopped, or `undefined` on a `stop()` of an app
 * that never listened: a server the Set does not hold, or none, stops nothing
 * of ours, which also makes the plugin given twice to one app dispose once.
 * An app that listens again after a stop adds its new server; the Container,
 * once disposed of, stays disposed (see the lifecycle guide).
 */
export function lifecycleOf(
	container: object,
	dispose: () => Promise<void>,
): Plugin {
	let serving = started.get(container);
	if (serving === undefined) {
		serving = new Set();
		started.set(container, serving);
	}
	const servers = serving;
	return function lifecycle<App extends AnyAlxia>(app: App): App {
		return app
			.onStart((server) => {
				servers.add(server);
			})
			.onStop(async (server) => {
				if (server === undefined || !servers.delete(server)) return;
				if (servers.size === 0) await dispose();
			}) as App;
	};
}
