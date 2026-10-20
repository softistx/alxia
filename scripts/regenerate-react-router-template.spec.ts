import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { addAlxia, addPlugin, toBun } from './regenerate-react-router-template';

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
	test("adds alxia's packages, sorted, runs dev in development and starts the build on Bun", () => {
		const manifest = addAlxia(SCAFFOLD_MANIFEST);
		expect(manifest.scripts['dev']).toBe(
			'NODE_ENV=development react-router dev',
		);
		expect(manifest.scripts['start']).toBe(
			'NODE_ENV=production bun build/server/index.js',
		);
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
