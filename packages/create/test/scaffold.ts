/**
 * What `create-react-router@8.4.0` writes, the two files the alxia layer
 * edits, as specs stand it in for the real command.
 */
import { join } from 'node:path';

export const SCAFFOLD_MANIFEST = {
	name: 'my-app',
	private: true,
	type: 'module',
	scripts: {
		build: 'react-router build',
		dev: 'react-router dev',
		start: 'react-router-serve ./build/server/index.js',
		typecheck: 'react-router typegen && tsc',
	},
	dependencies: {
		'@react-router/node': '^8.4.0',
		'@react-router/serve': '^8.4.0',
		isbot: '^5.1.36',
		react: '^19.2.8',
		'react-dom': '^19.2.8',
		'react-router': '^8.4.0',
	},
	devDependencies: {
		'@react-router/dev': '^8.4.0',
		'@tailwindcss/vite': '^4.2.2',
		'@types/node': '^22',
		'@types/react': '^19.2.18',
		'@types/react-dom': '^19.2.7',
		tailwindcss: '^4.2.2',
		typescript: '^5.9.3',
		vite: '^8.0.3',
	},
};

export const SCAFFOLD_VITE_CONFIG = `import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
});
`;

/** Writes the scaffold into `dir`, with `edit` applied to its files first. */
export async function writeScaffold(
	dir: string,
	edit: { manifest?: unknown; viteConfig?: string } = {},
): Promise<void> {
	await Bun.write(
		join(dir, 'package.json'),
		`${JSON.stringify(edit.manifest ?? SCAFFOLD_MANIFEST, null, 2)}\n`,
	);
	await Bun.write(
		join(dir, 'vite.config.ts'),
		edit.viteConfig ?? SCAFFOLD_VITE_CONFIG,
	);
	await Bun.write(join(dir, 'app', 'root.tsx'), 'export default null;\n');
}

/** A registry that knows `versions` of each package, `latest` the last one. */
export function fakeRegistry(
	packages: Record<string, readonly string[]>,
	options: { failing?: readonly string[] } = {},
): { url: string; requested: string[]; stop: () => void } {
	const requested: string[] = [];
	const server = Bun.serve({
		port: 0,
		fetch: (request) => {
			const name = decodeURIComponent(new URL(request.url).pathname.slice(1));
			requested.push(name);
			const versions = packages[name];
			if (!versions || options.failing?.includes(name)) {
				return new Response('not found', { status: 404 });
			}
			return Response.json({
				name,
				'dist-tags': { latest: versions.at(-1) },
				versions: Object.fromEntries(versions.map((v) => [v, {}])),
			});
		},
	});
	return {
		url: `http://localhost:${server.port}`,
		requested,
		stop: () => server.stop(true),
	};
}
