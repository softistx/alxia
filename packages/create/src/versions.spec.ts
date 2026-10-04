import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alxiaRanges, PEER_RANGES } from './versions';

const PACKAGES = new URL('../..', import.meta.url).pathname;
const peersOf = async (dir: string): Promise<Record<string, string>> =>
	(await Bun.file(join(PACKAGES, dir, 'package.json')).json()).peerDependencies;
const versionOf = async (dir: string): Promise<string> =>
	(await Bun.file(join(PACKAGES, dir, 'package.json')).json()).version;

describe('PEER_RANGES', () => {
	// Kept twice on purpose: the published @alxia/create cannot read a
	// sibling's manifest. A widened peer fails here until it is widened there.
	test("is each package's own peer range", async () => {
		const reactRouter = await peersOf('react-router');
		const ranges: Record<string, string> = { ...PEER_RANGES };
		expect(ranges).toEqual({
			typescript: (await peersOf('core'))['typescript'] as string,
			zod: (await peersOf('zod'))['zod'] as string,
			'react-router': reactRouter['react-router'] as string,
			vite: reactRouter['vite'] as string,
		});
		for (const dir of ['react-router', 'zod']) {
			expect((await peersOf(dir))['typescript']).toBe(PEER_RANGES.typescript);
		}
	});
});

describe('alxiaRanges', () => {
	const dirs: string[] = [];
	afterAll(async () => {
		for (const dir of dirs) await rm(dir, { recursive: true, force: true });
	});

	test("in the workspace, workspace:^ reads as ^ and the sibling's version, as bun publish writes it", async () => {
		expect(await alxiaRanges()).toEqual({
			'@alxia/core': `^${await versionOf('core')}`,
			'@alxia/openapi': `^${await versionOf('openapi')}`,
			'@alxia/react-router': `^${await versionOf('react-router')}`,
		});
	});

	test('published, the ranges its package.json carries', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alxia-create-versions-'));
		dirs.push(dir);
		const file = join(dir, 'package.json');
		await Bun.write(
			file,
			JSON.stringify({
				devDependencies: {
					'@alxia/core': '^0.3.0',
					'@alxia/openapi': '^0.4.0',
					'@alxia/react-router': '^0.2.0',
				},
			}),
		);
		expect(await alxiaRanges(new URL(`file://${file}`))).toEqual({
			'@alxia/core': '^0.3.0',
			'@alxia/openapi': '^0.4.0',
			'@alxia/react-router': '^0.2.0',
		});
	});

	test('refuses a manifest that does not name one of them', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alxia-create-versions-'));
		dirs.push(dir);
		const file = join(dir, 'package.json');
		await Bun.write(file, JSON.stringify({ devDependencies: {} }));
		await expect(alxiaRanges(new URL(`file://${file}`))).rejects.toThrow(
			'@alxia/create: its package.json names no @alxia/core',
		);
	});
});
