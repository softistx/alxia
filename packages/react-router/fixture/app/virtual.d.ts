// What `react-router typegen` would declare: the server build Vite serves.
declare module 'virtual:react-router/server-build' {
	import type { ServerBuild } from 'react-router';

	const build: ServerBuild;
	export = build;
}
