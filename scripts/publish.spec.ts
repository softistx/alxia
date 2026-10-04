import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	appendChangesetsOutput,
	changesetsGitTagEvent,
	inDependencyOrder,
	readPackages,
} from './publish';

describe('changesets/action@v2 output', () => {
	const dirs: string[] = [];
	afterAll(() =>
		Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))),
	);

	test('emits one NDJSON git-tag event per line', () => {
		const line = changesetsGitTagEvent('@alxia/shared', '@alxia/shared@1.2.3');
		expect(line.endsWith('\n')).toBe(true);
		expect(JSON.parse(line)).toEqual({
			type: 'git-tag',
			tag: '@alxia/shared@1.2.3',
			packageName: '@alxia/shared',
		});
	});

	test('appends events so a second publish does not clobber the first', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'changesets-output-'));
		dirs.push(dir);
		const path = join(dir, 'output.ndjson');
		await appendChangesetsOutput(path, '@alxia/i18n', '@alxia/i18n@1.0.3');
		await appendChangesetsOutput(path, '@alxia/shared', '@alxia/shared@1.0.4');
		const raw = await readFile(path, 'utf8');
		const events = raw
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		expect(events).toEqual([
			{
				type: 'git-tag',
				tag: '@alxia/i18n@1.0.3',
				packageName: '@alxia/i18n',
			},
			{
				type: 'git-tag',
				tag: '@alxia/shared@1.0.4',
				packageName: '@alxia/shared',
			},
		]);
	});
});

describe('readPackages', () => {
	test('publishes packages/* alone, never an example', async () => {
		const pkgs = await readPackages();
		expect(pkgs.length).toBeGreaterThan(0);
		for (const pkg of pkgs) {
			expect(pkg.name).toStartWith('@alxia/');
			expect(pkg.dir).toContain('/packages/');
		}
	});
});

describe('inDependencyOrder', () => {
	test('publishes @alxia/create after every package its projects install', async () => {
		const order = inDependencyOrder(await readPackages()).map((p) => p.name);
		const create = order.indexOf('@alxia/create');
		expect(create).toBeGreaterThan(-1);
		for (const name of [
			'@alxia/core',
			'@alxia/client',
			'@alxia/react-router',
		]) {
			expect(order.indexOf(name)).toBeLessThan(create);
		}
	});
});
