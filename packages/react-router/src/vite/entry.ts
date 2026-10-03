/**
 * The source of the module the plugin serves in dev and builds as
 * `build/server/index.js`: the server, made into the app with React
 * Router's build, and in a build listening when run.
 */

export const NAME = 'alxia-react-router';

/** React Router's server build, as its Vite plugin serves it. */
const SERVER_BUILD = 'virtual:react-router/server-build';

/** The input when the plugin is disabled: React Router's build alone. */
export const PASS_THROUGH = `export * from '${SERVER_BUILD}';\n`;

export interface EntryOptions {
	/** The server file, absolute, or `undefined` for `createServer()` as it is. */
	readonly file: string | undefined;
	/** How an error names the file: relative to Vite's root. */
	readonly label: string;
	/** Under `react-router dev`: the build on every request, no client, no listening. */
	readonly dev: boolean;
	/** The client build, relative to the built file: `../client`. */
	readonly client: string | undefined;
}

export function serverEntry({
	file,
	label,
	dev,
	client,
}: EntryOptions): string {
	const lines = ['// Written by @alxia/react-router/vite.'];
	if (file === undefined) {
		lines.push(
			"import { createServer } from '@alxia/react-router';",
			'const server = createServer();',
		);
	} else {
		lines.push(
			`import server from ${JSON.stringify(file)};`,
			"if (typeof server?.create !== 'function' || typeof server.start !== 'function') {",
			`\tthrow new TypeError(${JSON.stringify(
				`${NAME}: ${label} must export createServer() from @alxia/react-router as its default export: export default createServer({ … }).`,
			)});`,
			'}',
		);
	}
	if (dev) {
		lines.push(
			'export default server.create({',
			`\tbuild: () => import('${SERVER_BUILD}'),`,
			"\tmode: 'development',",
			'});',
		);
	} else {
		lines.push(
			`import * as build from '${SERVER_BUILD}';`,
			// What a server build exports, beside the app: React Router reads it
			// back to prerender. The server file's other exports stay out of it.
			`export * from '${SERVER_BUILD}';`,
			'const app = server.create({',
			'\tbuild,',
			"\tmode: 'production',",
			`\tclient: new URL(${JSON.stringify(client ?? '../client')}, import.meta.url),`,
			'});',
			'export default app;',
			// Run, not imported: prerendering, or a test, imports it.
			'if (import.meta.main) server.start(app);',
		);
	}
	return `${lines.join('\n')}\n`;
}
