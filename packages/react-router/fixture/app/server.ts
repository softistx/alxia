/**
 * The fixture's server for `@alxia/react-router/vite`: loaded by Vite in
 * dev, built into `build/server/index.js`. The `/vite` specs also run the
 * fixture without it, on the default server.
 */
import { createServer } from '@alxia/react-router';
import { configure } from '../base';
import { greetingContext } from './context';

const server = createServer({
	configure,
	// Built with the app, this is the routes' own key.
	getLoadContext: (_ctx, context) =>
		context.set(greetingContext, 'from the entry'),
	onListen: (listening) => console.log(`fixture listening on ${listening.url}`),
});

export default server;

// What `alxiaOf(context)` reads in the routes, with no type argument.
declare module '@alxia/react-router' {
	interface Register {
		server: typeof server;
	}
}
