import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
	addAlxia,
	addBiome,
	addLintSection,
	addPlugin,
	BIOME_CONFIG,
	BIOME_SCRIPTS,
	LINT_SECTION,
	toBun,
} from './regenerate-react-router-template';

const ROOT = join(import.meta.dir, '..');

/** `create-react-router@8.4.0`'s `vite.config.ts`, as it writes it. */
const SCAFFOLD_VITE_CONFIG = `import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
});
`;

const SCAFFOLD_MANIFEST = {
	scripts: {
		build: 'react-router build',
		dev: 'react-router dev',
		start: 'react-router-serve ./build/server/index.js',
	},
	dependencies: {
		react: '^19.2.8',
		'react-router': '^8.4.0',
		'@react-router/node': '^8.4.0',
	},
};

describe('addPlugin', () => {
	test("gives examples/react-router's vite.config.ts", async () => {
		expect(addPlugin(SCAFFOLD_VITE_CONFIG)).toBe(
			await Bun.file(join(ROOT, 'examples/react-router/vite.config.ts')).text(),
		);
	});

	test('refuses a config without exactly one reactRouter()', () => {
		expect(() => addPlugin('export default {};\n')).toThrow(
			'expected reactRouter() exactly once',
		);
	});
});

describe('addAlxia', () => {
	test("adds alxia's packages, sorted, and starts the build on Bun", () => {
		const manifest = addAlxia(SCAFFOLD_MANIFEST);
		expect(manifest.scripts['start']).toBe('bun build/server/index.js');
		expect(Object.keys(manifest.dependencies)).toEqual([
			'@alxia/core',
			'@alxia/react-router',
			'@react-router/node',
			'react',
			'react-router',
		]);
	});

	test("refuses a manifest whose scripts are not React Router's, or with no start", () => {
		expect(() =>
			addAlxia({
				...SCAFFOLD_MANIFEST,
				scripts: { ...SCAFFOLD_MANIFEST.scripts, dev: 'vite' },
			}),
		).toThrow('expected react-router in its dependencies');
		const { start: _, ...scripts } = SCAFFOLD_MANIFEST.scripts;
		expect(() => addAlxia({ ...SCAFFOLD_MANIFEST, scripts })).toThrow(
			'package.json: expected',
		);
	});
});

describe('addBiome', () => {
	test('adds the scripts and @biomejs/biome, pinned and sorted among the devDependencies', () => {
		const manifest = addBiome(
			{
				...SCAFFOLD_MANIFEST,
				devDependencies: { '@react-router/dev': '^8.4.0', vite: '^8.0.3' },
			},
			'2.5.15',
		);
		expect(manifest.scripts).toEqual({
			...SCAFFOLD_MANIFEST.scripts,
			...BIOME_SCRIPTS,
		});
		expect(manifest['devDependencies']).toEqual({
			'@biomejs/biome': '2.5.15',
			'@react-router/dev': '^8.4.0',
			vite: '^8.0.3',
		});
		expect(Object.keys(manifest['devDependencies'] as object)[0]).toBe(
			'@biomejs/biome',
		);
	});
});

describe('addLintSection', () => {
	test('puts the section before Styling', () => {
		expect(addLintSection('# App\n\n## Styling\n\nTailwind.\n')).toBe(
			`# App\n\n${LINT_SECTION}## Styling\n\nTailwind.\n`,
		);
	});

	test('refuses a README with no Styling section', () => {
		expect(() => addLintSection('# App\n')).toThrow(
			'README.md: expected a ## Styling section',
		);
	});
});

describe('the committed template', () => {
	const TEMPLATE = join(ROOT, 'packages/create/templates/react-router');

	test("its README has LINT_SECTION, and the api template's README the same but for verify", async () => {
		expect(await Bun.file(join(TEMPLATE, 'README.md')).text()).toContain(
			LINT_SECTION,
		);
		const api = await Bun.file(
			join(ROOT, 'packages/create/templates/api/README.md'),
		).text();
		expect(api).toContain(
			LINT_SECTION.replace(
				/What the build and[\s\S]*?is skipped\./,
				'What the build writes, `dist/`, is skipped.',
			)
				.replaceAll('```bash', '```sh')
				.replace(
					'check:ci, then typecheck, then build',
					'check:ci, then typecheck, then test',
				),
		);
	});

	test('stores BIOME_CONFIG as _biome.json', async () => {
		expect(await Bun.file(join(TEMPLATE, '_biome.json')).json()).toEqual(
			BIOME_CONFIG,
		);
	});

	test("has BIOME_SCRIPTS, and the api template's but for verify's last step", async () => {
		const { scripts } = await Bun.file(join(TEMPLATE, 'package.json')).json();
		expect(scripts).toMatchObject(BIOME_SCRIPTS);
		const api = (
			await Bun.file(
				join(ROOT, 'packages/create/templates/api/package.json'),
			).json()
		).scripts;
		expect({ ...api, verify: BIOME_SCRIPTS.verify }).toMatchObject(
			BIOME_SCRIPTS,
		);
	});
});

/** The lines of `create-react-router@8.4.0`'s README that name npm. */
const SCAFFOLD_README = `\`\`\`bash
npm install
\`\`\`

\`\`\`bash
npm run dev
\`\`\`

\`\`\`bash
npm run build
\`\`\`

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of \`npm run build\`

\`\`\`
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
\`\`\`
`;

describe('toBun', () => {
	test("gives the scaffold's README Bun's commands and lockfile", () => {
		expect(toBun(SCAFFOLD_README)).toBe(`\`\`\`bash
bun install
\`\`\`

\`\`\`bash
bun dev
\`\`\`

\`\`\`bash
bun run build
\`\`\`

The build is production-ready and self-contained: \`bun run start\` runs \`build/server/index.js\` on Bun, with every dependency bundled into it, so \`build/\` needs no \`node_modules\`.

Make sure to deploy the output of \`bun run build\`

\`\`\`
├── package.json
├── bun.lock
├── build/
\`\`\`
`);
	});

	test('npx becomes bunx', () => {
		expect(toBun('npx react-router typegen\n')).toBe(
			'bunx react-router typegen\n',
		);
	});

	test('refuses a command of another package manager it does not know', () => {
		expect(() => toBun('Then:\n\n    yarn add tailwindcss\n')).toThrow(
			'README.md: a yarn command toBun does not know is left:     yarn add tailwindcss',
		);
		expect(() => toBun('Run `pnpm dlx shadcn`.\n')).toThrow('a pnpm command');
	});
});
