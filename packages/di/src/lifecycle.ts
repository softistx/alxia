import type { AnyAlxia, Plugin } from '@alxia/core';

/**
 * The plugin behind `deps.lifecycle`: counts the starts of the apps it was
 * given to, and disposes of the Container when a stop brings the count
 * back to zero.
 *
 * A fork takes its base's `onStart` and `onStop`, and runs each once of its
 * own, so two forks of a base given this plugin count two: stopping one
 * leaves the Container to the other, and the second stop disposes of it.
 * Disposing twice does nothing.
 *
 * Core runs every `onStop` on a `stop()` before `listen` too, and a hook is
 * told neither which app stops nor whether it had started. A stop with
 * nothing started is ignored, so the count never goes below zero. A known
 * limit: an app that never started, stopped while another serves, still
 * counts as one that did, and disposes of the Container under it. See the
 * lifecycle guide.
 */
export function lifecycleOf(dispose: () => Promise<void>): Plugin {
	let serving = 0;
	return function lifecycle<App extends AnyAlxia>(app: App): App {
		return app
			.onStart(() => {
				serving++;
			})
			.onStop(async () => {
				if (serving === 0) return;
				serving--;
				if (serving === 0) await dispose();
			}) as App;
	};
}
