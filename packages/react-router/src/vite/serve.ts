/**
 * `build/server/serve.js`: the process that listens, kept apart from the
 * server build, so that importing the build — React Router prerendering, a
 * test — never starts a server.
 */

/** The source of `serve.js`, beside `entry`, the server build's file. */
export function serveScript(entry: string): string {
	return `// Written by @alxia/react-router/vite: the server build, listening.
import app from './${entry}';

const server = app.listen({
	port: Number(process.env.PORT ?? 3000),
	hostname: process.env.HOST ?? '0.0.0.0',
});
console.log(\`alxia listening on \${server.url}\`);

// Stop as the platform asks: the app's onStop hooks run, and the process ends.
for (const signal of ['SIGINT', 'SIGTERM']) {
	process.once(signal, () => void app.stop().then(() => process.exit(0)));
}
`;
}
