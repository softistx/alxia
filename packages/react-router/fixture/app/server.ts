/**
 * The fixture's server entry for `@alxia/react-router/vite`: loaded by Vite
 * in dev, the server build's input in production.
 */
import { reactRouter } from '@alxia/react-router';
import type { ServerBuild } from 'react-router';
import { makeBase } from '../base';
import { greetingContext } from './context';

export default makeBase().use((app) =>
	reactRouter(app, {
		build: () =>
			import('virtual:react-router/server-build') as Promise<ServerBuild>,
		mode: import.meta.env.DEV ? 'development' : 'production',
		client: new URL('../client', import.meta.url),
		// Built with the app, this is the routes' own key.
		getLoadContext: (_ctx, context) =>
			context.set(greetingContext, 'from the entry'),
	}),
);
