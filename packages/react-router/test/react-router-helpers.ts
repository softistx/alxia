/** What the `reactRouter` specs share: the fixture's build and how to ask it. */
import { beforeAll } from 'bun:test';
// The package by its published name, `dist/`, not `./src`: the fixture's
// build imports it so, and the catch-all must set the very `alxiaContext`
// its loaders read.
import { reactRouter } from '@alxia/react-router';
import type { ServerBuild } from 'react-router';
import { makeBase } from '../fixture/base';
import { CLIENT, fixtureBuild } from './fixture';

/** The fixture's build: call `loadBuild()` at the top of a spec file first. */
export let build: ServerBuild;

/** Builds the fixture once for the file that calls it. */
export function loadBuild() {
	beforeAll(async () => {
		build = await fixtureBuild();
	}, 60_000);
}

/** The fixture served as an app would serve it: `/api/health`, then the catch-all. */
export function served() {
	return makeBase().plugin((app) =>
		reactRouter(app, { build, client: CLIENT }),
	);
}
