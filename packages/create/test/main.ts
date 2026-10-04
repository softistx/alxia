/** What the create-alxia specs share: the registry's versions, a fresh directory per test, and a fake terminal. */
import { afterAll, afterEach, beforeEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Io } from '../src/main';
import { alxiaRanges } from '../src/versions';
import { fakeRegistry } from './registry';

export const ALXIA = await alxiaRanges();
/** The version each `@alxia/*` range starts at: `0.3.1` for `^0.3.1`. */
const ALXIA_VERSIONS = Object.fromEntries(
	Object.entries(ALXIA).map(([name, range]) => [name, [range.slice(1)]]),
);

export const VERSIONS = {
	zod: ['4.2.0', '4.6.5'],
	typescript: ['6.0.3', '7.0.2'],
	'@types/bun': ['1.4.2'],
	'@biomejs/biome': ['2.5.15', '2.5.16', '2.6.0', '3.0.0'],
	'@nxgt/openapi-codegen': ['0.6.0', '0.6.1', '0.7.0'],
	'react-router': ['8.4.0'],
	'@react-router/node': ['8.4.0'],
	'@react-router/serve': ['8.4.0'],
	'@react-router/dev': ['8.4.0'],
	isbot: ['5.2.2'],
	react: ['19.3.0'],
	'react-dom': ['19.3.0'],
	'@tailwindcss/vite': ['4.3.3'],
	tailwindcss: ['4.3.3'],
	'@types/node': ['26.6.4'],
	'@types/react': ['19.3.0'],
	'@types/react-dom': ['19.3.0'],
	vite: ['8.3.2'],
	...ALXIA_VERSIONS,
};

export interface Fake {
	readonly io: Io;
	readonly out: string[];
	readonly err: string[];
	readonly ran: { command: readonly string[]; cwd: string }[];
}

/** A fresh directory and a fake registry for each test, removed after the file. */
export function useProject() {
	const project = {} as {
		root: string;
		registry: ReturnType<typeof fakeRegistry>;
	};
	const roots: string[] = [];
	beforeEach(async () => {
		project.root = await mkdtemp(join(tmpdir(), 'alxia-create-main-'));
		roots.push(project.root);
		project.registry = fakeRegistry(VERSIONS);
	});
	afterEach(() => project.registry.stop());
	afterAll(async () => {
		for (const dir of roots) await rm(dir, { recursive: true, force: true });
	});
	return project;
}

export interface FakeOptions {
	answers?: (string | null)[];
	codes?: { install?: number };
	registryUrl?: string;
}

/**
 * An `Io` that answers `answers` in turn (null: no terminal), runs nothing
 * but records each command, and exits `bun install` with `codes.install`, 0
 * by default; asks `registry` unless `registryUrl` says otherwise.
 */
export function fake(registry: string, options: FakeOptions = {}): Fake {
	const out: string[] = [];
	const err: string[] = [];
	const ran: Fake['ran'] = [];
	const answers = [...(options.answers ?? [])];
	return {
		out,
		err,
		ran,
		io: {
			out: (line) => out.push(line),
			err: (line) => err.push(line),
			// No answers left: no terminal.
			ask: () => (answers.length > 0 ? answers.shift() : undefined),
			run: async (command, cwd) => {
				ran.push({ command, cwd });
				return options.codes?.install ?? 0;
			},
			env: { BUN_CONFIG_REGISTRY: options.registryUrl ?? registry },
		},
	};
}

export const json = (file: string) => Bun.file(file).json();
