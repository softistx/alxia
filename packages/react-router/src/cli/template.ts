/**
 * The server file `alxia-react-router reveal` writes: `createServer()` as
 * the default server runs it, its options commented, and the `Register`
 * declaration that types the loaders.
 */

/** The file, as written. Every commented option compiles once uncommented. */
export const SERVER_FILE = `/**
 * The alxia server of this React Router app: what alxia() from
 * @alxia/react-router/vite runs when there is no server file, written out by
 * \`alxia-react-router reveal\`. Uncomment an option to customise it.
 */
import { createServer } from '@alxia/react-router';
// import { userAgentContext } from './context'; // for getLoadContext, below

const server = createServer({
	// Runs first, on a new app, before the client's files too: a guard, a rate
	// limit, a logger that should see every request. Returns the app.
	// beforeAll: (app) => app,

	// The app the pages run behind: its plugins, its hooks, its /api. What it
	// builds is what alxiaOf(context) reads in the loaders. Returns the app.
	// configure: (app) => app.get('/api/health', ({ reply }) => reply.ok({ ok: true })),

	// Sets the app's own React Router context keys, ctx typed by configure's
	// app. A key made with createContext() from react-router, in app/context.ts.
	// getLoadContext: (ctx, context) => {
	// 	context.set(userAgentContext, ctx.request.headers.get('user-agent'));
	// },
});

export default server;

// What alxiaOf(context) reads in the loaders, with no type argument.
declare module '@alxia/react-router' {
	interface Register {
		server: typeof server;
	}
}
`;
