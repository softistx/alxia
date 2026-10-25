import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { copyFixture } from '../../test/fixture';
import { build, configFile, type Fixture, start } from '../../test/vite';

const WORKER = `import { defineWorkerContract } from '@alxia/react-router/pwa';
import { startWorker } from '@alxia/react-router/pwa/worker';

startWorker({ contract: defineWorkerContract({ cachePrefix: 'fixture' }) });
`;

const exists = (root: string, file: string) =>
	Bun.file(join(root, 'build', 'client', file)).exists();

/** A copy with the worker and the offline page the app would have. */
async function workerFixture(): Promise<Fixture> {
	const fixture = await copyFixture();
	await Bun.write(join(fixture.root, 'app', 'service-worker.ts'), WORKER);
	await Bun.write(
		join(fixture.root, 'public', 'offline.html'),
		'<h1>offline</h1>',
	);
	return fixture;
}

describe('react-router build, with app/service-worker.ts', () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await workerFixture();
		await build(fixture.root);
	}, 90_000);
	afterAll(async () => {
		await fixture?.remove();
	});

	test('writes build/client/service-worker.js, with the routes and the offline page precached', async () => {
		const code = await Bun.file(
			join(fixture.root, 'build', 'client', 'service-worker.js'),
		).text();
		expect(code).toContain('/offline.html');
		expect(code).toMatch(/\/assets\/entry\.client-[\w-]+\.js/);
	});

	test('the built server serves it as JavaScript', async () => {
		const { child, url } = await start(fixture.root, 'fixture');
		try {
			const response = await fetch(new URL('/service-worker.js', url));
			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toContain('javascript');
		} finally {
			child.kill();
			await child.exited;
		}
	});
});

describe('react-router build, with no worker to build', () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await workerFixture();
		const off = await configFile(fixture.root, 'off', (source) =>
			source.replace('alxia()', 'alxia({ worker: false })'),
		);
		await build(fixture.root, off);
	}, 90_000);
	afterAll(async () => {
		await fixture?.remove();
	});

	test('worker: false builds none, though the file is there', async () => {
		expect(await exists(fixture.root, 'service-worker.js')).toBe(false);
	});

	test('without app/service-worker.ts there is none either', async () => {
		await Bun.file(join(fixture.root, 'app', 'service-worker.ts')).delete();
		await build(fixture.root);
		expect(await exists(fixture.root, 'service-worker.js')).toBe(false);
	}, 60_000);
});

describe('react-router build, with a worker that is not there', () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await copyFixture();
	});
	afterAll(async () => {
		await fixture?.remove();
	});

	test('fails, saying which file is missing', async () => {
		const missing = await configFile(fixture.root, 'missing', (source) =>
			source.replace('alxia()', "alxia({ worker: 'sw/missing.ts' })"),
		);
		await expect(build(fixture.root, missing)).rejects.toThrow(
			'alxia-react-router: the worker sw/missing.ts does not exist. Create it, or leave worker out to build app/service-worker.ts when it exists.',
		);
	}, 60_000);
});
