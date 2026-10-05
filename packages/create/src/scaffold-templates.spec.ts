import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { ALXIA, type FakeOptions, fake, json, useProject } from '../test/main';
import { main } from './main';

const project = useProject();
/** A fake terminal asking this test's registry. */
const ask = (options: FakeOptions = {}) => fake(project.registry.url, options);

describe('create-alxia: the minimal and graphql projects written', () => {
	test('minimal: one alxia dependency, the newest tooling, bun dev as the next step', async () => {
		const { io, out } = ask();
		expect(
			await main(
				['hello', '--template', 'minimal', '--no-install'],
				project.root,
				io,
			),
		).toBe(0);
		const manifest = await json(join(project.root, 'hello', 'package.json'));
		expect(manifest.name).toBe('hello');
		expect(manifest.dependencies).toEqual({
			'@alxia/core': ALXIA['@alxia/core'],
		});
		expect(manifest.devDependencies.typescript).toBe('^7.0.2');
		expect(manifest.devDependencies['@biomejs/biome']).toBe('2.5.16');
		expect(
			await Bun.file(join(project.root, 'hello', 'src/index.ts')).text(),
		).toContain('alxia().get("/"');
		expect(out.at(-1)).toContain('holds the minimal template');
	});

	test('graphql: alxia at its versions, Yoga and graphql at the newest they accept, the generator kept', async () => {
		const { io } = ask();
		expect(
			await main(
				['gql', '--template', 'graphql', '--no-install'],
				project.root,
				io,
			),
		).toBe(0);
		const dir = join(project.root, 'gql');
		const manifest = await json(join(dir, 'package.json'));
		expect(manifest.dependencies).toEqual({
			'@alxia/core': ALXIA['@alxia/core'],
			'@alxia/env': ALXIA['@alxia/env'],
			'@alxia/graphql': ALXIA['@alxia/graphql'],
			dataloader: '^2.2.3',
			graphql: '^17.0.2',
			'graphql-yoga': '^5.24.1',
			zod: '^4.6.5',
		});
		// Committed output, so the generator stays as the template ships it.
		expect(manifest.devDependencies['@graphql-codegen/cli']).toBe('7.4.3');
		expect(manifest.scripts.generate).toBe(
			'graphql-codegen --config codegen.ts',
		);
		for (const file of [
			'schema.graphql',
			'codegen.ts',
			'src/generated/resolvers.ts',
			'biome.json',
			'.gitignore',
		]) {
			expect(await Bun.file(join(dir, file)).exists()).toBe(true);
		}
		expect(await Bun.file(join(dir, '_biome.json')).exists()).toBe(false);
	});

	test('with no template given, minimal is the one asked first', async () => {
		const { io, err } = ask({ answers: ['here', 'minimal'] });
		expect(await main(['--no-install'], project.root, io)).toBe(0);
		expect(err).toEqual([]);
		expect(
			await Bun.file(join(project.root, 'here/src/index.ts')).exists(),
		).toBe(true);
	});
});
