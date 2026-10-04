/**
 * The `react-router` template: React Router's official one, from its own
 * `create-react-router`, then alxia added as `examples/react-router` adds it
 * — `@alxia/core` and `@alxia/react-router` as dependencies, `alxia()` in
 * the Vite plugins, `start` running the build on Bun, and a `bunfig.toml`
 * that starts React Router's CLI on Bun. Each edit checks the file is the one
 * it expects first, and refuses rather than write a project that does not
 * work.
 */
import { join } from 'node:path';
import type { Manifest } from '../registry';
import { type AlxiaPackage, highestMajor, PEER_RANGES } from '../versions';

/**
 * The scaffold's command line: the newest `create-react-router` of the
 * highest React Router major `@alxia/react-router` accepts, with no prompt,
 * no install and no git repository — the install is ours, once alxia is in.
 */
export function scaffoldCommand(dir: string): string[] {
	return [
		`create-react-router@${highestMajor(PEER_RANGES['react-router'])}`,
		dir,
		'--yes',
		'--no-install',
		'--no-git-init',
		'--no-agent-skills',
		'--no-motion',
	];
}

/** The scaffold is not what the edits expect: nothing more is written, and `main` removes it. */
export class ScaffoldChanged extends Error {
	constructor(file: string, expected: string) {
		super(
			`create-react-router's ${file} is not what this @alxia/create expects: ${expected}. ` +
				'Nothing was kept. Try the newest @alxia/create, or add @alxia/react-router to a React Router app by hand, as its README shows.',
		);
		this.name = 'ScaffoldChanged';
	}
}

export const BUNFIG = `[run]
# The React Router CLI is a node script: this starts it on Bun, which
# alxia's server needs, even where a node is installed.
bun = true
`;

const IMPORT = 'import { alxia } from "@alxia/react-router/vite";\n';

/** `vite.config.ts` with `alxia()` after `reactRouter()`. */
export function addPlugin(config: string): string {
	const calls = config.match(/\breactRouter\(\)/g) ?? [];
	if (
		!config.includes('from "@react-router/dev/vite"') ||
		!/plugins:\s*\[[^\]]*\breactRouter\(\)[^\]]*\]/.test(config) ||
		calls.length !== 1
	) {
		throw new ScaffoldChanged(
			'vite.config.ts',
			'reactRouter() from "@react-router/dev/vite", called once in plugins: [...]',
		);
	}
	if (config.includes('@alxia/react-router/vite')) {
		throw new ScaffoldChanged(
			'vite.config.ts',
			'it already imports @alxia/react-router/vite',
		);
	}
	return IMPORT + config.replace(/\breactRouter\(\)/, 'reactRouter(), alxia()');
}

/** The manifest with alxia's dependencies and `start` on Bun. */
export function addAlxia(
	manifest: Manifest,
	alxia: Record<AlxiaPackage, string>,
): Manifest {
	const scripts = manifest['scripts'] as Record<string, string> | undefined;
	if (
		scripts?.['dev'] !== 'react-router dev' ||
		scripts['build'] !== 'react-router build' ||
		scripts['start'] === undefined ||
		manifest.dependencies?.['react-router'] === undefined
	) {
		throw new ScaffoldChanged(
			'package.json',
			'react-router in its dependencies, and the scripts `dev: react-router dev`, `build: react-router build` and a `start`',
		);
	}
	const dependencies = sorted({
		...manifest.dependencies,
		'@alxia/core': alxia['@alxia/core'],
		'@alxia/react-router': alxia['@alxia/react-router'],
	});
	return {
		...manifest,
		scripts: { ...scripts, start: 'bun build/server/index.js' },
		dependencies,
	};
}

function sorted(deps: Record<string, string>): Record<string, string> {
	return Object.fromEntries(
		Object.entries(deps).sort(([a], [b]) => (a < b ? -1 : 1)),
	);
}

/**
 * Reads what the scaffold wrote in `dir` and checks it, without writing:
 * the manifest with alxia in, and the files to write beside it.
 */
export async function alxiaLayer(
	dir: string,
	alxia: Record<AlxiaPackage, string>,
): Promise<{ manifest: Manifest; files: Record<string, string> }> {
	const read = async (file: string) => {
		const handle = Bun.file(join(dir, file));
		if (!(await handle.exists())) {
			throw new ScaffoldChanged(file, 'it is missing');
		}
		return handle.text();
	};
	const manifest = addAlxia(JSON.parse(await read('package.json')), alxia);
	const config = addPlugin(await read('vite.config.ts'));
	if (await Bun.file(join(dir, 'bunfig.toml')).exists()) {
		throw new ScaffoldChanged('bunfig.toml', 'none, and there is one');
	}
	return {
		manifest,
		files: { 'vite.config.ts': config, 'bunfig.toml': BUNFIG },
	};
}
