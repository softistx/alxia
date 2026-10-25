import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alxia } from '@alxia/core';
import { SERVICE_WORKER_URL } from '../model/worker-contract';
import { noCache, revalidated, WORKER_POLICY } from './no-cache';

const ORIGIN = 'https://app.test';

describe('revalidated', () => {
	test('replaces Cache-Control and keeps the rest', async () => {
		const response = revalidated(
			new Response('self.x=1', {
				status: 200,
				headers: {
					'cache-control': 'public, max-age=3600',
					'content-type': 'text/javascript',
					etag: 'W/"1"',
				},
			}),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-cache');
		expect(response.headers.get('content-type')).toBe('text/javascript');
		expect(response.headers.get('etag')).toBe('W/"1"');
		expect(await response.text()).toBe('self.x=1');
	});

	test('gives the worker its own policy: no script but its own, fetches to this site', () => {
		const response = revalidated(new Response('self.x=1'));
		expect(response.headers.get('content-security-policy')).toBe(WORKER_POLICY);
		expect(WORKER_POLICY).toBe("default-src 'none'; connect-src 'self'");
	});

	test('takes a policy of its own', () => {
		const response = revalidated(
			new Response('self.x=1'),
			"default-src 'none'; connect-src 'self' https://api.test",
		);
		expect(response.headers.get('content-security-policy')).toBe(
			"default-src 'none'; connect-src 'self' https://api.test",
		);
	});

	test('keeps a 304 a 304', () => {
		expect(revalidated(new Response(null, { status: 304 })).status).toBe(304);
	});

	test('edits a response whose headers are immutable', () => {
		const response = revalidated(Response.redirect(`${ORIGIN}/elsewhere`, 302));
		expect(response.status).toBe(302);
		expect(response.headers.get('cache-control')).toBe('no-cache');
	});
});

describe('noCache', () => {
	const dir = mkdtempSync(join(tmpdir(), 'alxia-no-cache-'));
	afterAll(() => rmSync(dir, { recursive: true, force: true }));
	const worker = join(dir, 'service-worker.js');
	const other = join(dir, 'other.js');
	writeFileSync(worker, 'self.x=1');
	writeFileSync(other, 'self.y=2');
	const hour = { cacheControl: 'public, max-age=3600' };
	const app = alxia()
		.use(SERVICE_WORKER_URL, noCache)
		.file(SERVICE_WORKER_URL, worker, hour)
		.file('/other.js', other, hour);

	test("revalidates the worker's script and gives it its policy", async () => {
		const response = await app.request(`${ORIGIN}${SERVICE_WORKER_URL}`);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-cache');
		expect(response.headers.get('content-security-policy')).toBe(WORKER_POLICY);
		expect(await response.text()).toBe('self.x=1');
	});

	test('leaves another file its hour and its policy alone', async () => {
		const response = await app.request(`${ORIGIN}/other.js`);
		expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
		expect(response.headers.get('content-security-policy')).toBeNull();
	});
});
