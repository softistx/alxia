import type { AnyAlxia, Plugin } from '@alxia/core';

/**
 * The plugin behind `deps.lifecycle`: counts the apps it was given to that
 * are serving, and disposes of the Container when the last one stops.
 *
 * A fork takes its base's `onStart` and `onStop`, and runs each once of its
 * own, so two forks of a base given this plugin count two: stopping one
 * leaves the Container to the other, mid-flight requests included, and the
 * second stop disposes of it. Disposing twice does nothing.
 */
export function lifecycleOf(dispose: () => Promise<void>): Plugin {
	let serving = 0;
	return function lifecycle<App extends AnyAlxia>(app: App): App {
		return app
			.onStart(() => {
				serving++;
			})
			.onStop(async () => {
				serving--;
				if (serving <= 0) await dispose();
			}) as App;
	};
}
