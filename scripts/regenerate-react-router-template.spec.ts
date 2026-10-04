import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { addAlxia, addPlugin } from './regenerate-react-router-template';

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
		const manifest = addAlxia({
			scripts: { dev: 'react-router dev', start: 'react-router-serve x' },
			dependencies: { react: '^19.2.8', '@react-router/node': '^8.4.0' },
		});
		expect(manifest.scripts['start']).toBe('bun build/server/index.js');
		expect(Object.keys(manifest.dependencies)).toEqual([
			'@alxia/core',
			'@alxia/react-router',
			'@react-router/node',
			'react',
		]);
	});
});
