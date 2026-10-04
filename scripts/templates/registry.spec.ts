import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRegistry } from './registry';

const dir = await mkdtemp(join(tmpdir(), 'alxia-registry-'));
const file = join(dir, 'create.tgz');
await Bun.write(file, 'not really a tarball');
const upstream = Bun.serve({
	port: 0,
	fetch: (request) =>
		Response.json({
			from: 'upstream',
			path: new URL(request.url).pathname,
			accept: request.headers.get('accept'),
		}),
});
const registry = await startRegistry(
	[
		{
			manifest: { name: '@alxia/create', version: '0.1.0', bin: { x: 'x' } },
			file,
		},
	],
	`http://localhost:${upstream.port}`,
);
afterAll(async () => {
	registry.stop();
	upstream.stop(true);
	await rm(dir, { recursive: true, force: true });
});

describe('startRegistry', () => {
	test('answers for a served package: one version, latest, its tarball checked by integrity', async () => {
		for (const path of ['@alxia%2fcreate', '@alxia/create']) {
			const packument = await (await fetch(`${registry.url}/${path}`)).json();
			expect(packument['dist-tags']).toEqual({ latest: '0.1.0' });
			const { dist, bin } = packument.versions['0.1.0'];
			expect(bin).toEqual({ x: 'x' });
			const bytes = await (await fetch(dist.tarball)).bytes();
			expect(new TextDecoder().decode(bytes)).toBe('not really a tarball');
			const sha512 = new Bun.CryptoHasher('sha512')
				.update(bytes)
				.digest('base64');
			expect(dist.integrity).toBe(`sha512-${sha512}`);
		}
	});

	test('passes any other request upstream, with its accept header', async () => {
		const answer = await fetch(`${registry.url}/zod`, {
			headers: { accept: 'application/vnd.npm.install-v1+json' },
		});
		expect(await answer.json()).toEqual({
			from: 'upstream',
			path: '/zod',
			accept: 'application/vnd.npm.install-v1+json',
		});
	});
});
