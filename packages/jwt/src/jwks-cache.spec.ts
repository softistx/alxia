import {
	afterAll,
	afterEach,
	describe,
	expect,
	setSystemTime,
	test,
} from 'bun:test';
import { type Issuer, issuer, signWith, testKey } from './jwks-fixtures';
import { createJwt } from './jwt';

const key = await testKey('ES256');
const stranger = await testKey('ES256', 'stranger');
const live: Issuer[] = [];
const serve = () => {
	const one = issuer([key]);
	live.push(one);
	return one;
};
afterAll(() => {
	for (const one of live) one.stop();
});
afterEach(() => setSystemTime());

const later = (ms: number) => setSystemTime(Date.now() + ms);
const unavailable = { ok: false, reason: 'keys_unavailable' } as const;

describe('an issuer that cannot be reached', () => {
	test('fails closed with nothing cached, and is not retried before refetchMs', async () => {
		const server = serve();
		server.failing = true;
		const jwt = createJwt({ jwks: server.jwksUrl, refetchMs: 10_000 });
		const token = await signWith(key);
		expect(await jwt.verify(token)).toEqual(unavailable);
		expect(await jwt.verify(token)).toEqual(unavailable);
		expect(server.hits['/jwks.json']).toBe(1);
		// It recovers once the issuer does, after the window.
		server.failing = false;
		later(10_001);
		expect((await jwt.verify(token)).ok).toBe(true);
	});

	test('a refused connection, a non-JSON answer and an empty set all fail closed', async () => {
		const gone = serve();
		const url = gone.jwksUrl;
		gone.stop();
		expect(await createJwt({ jwks: url }).verify(await signWith(key))).toEqual(
			unavailable,
		);
		const server = serve();
		server.keys = [];
		expect(
			await createJwt({ jwks: server.jwksUrl }).verify(await signWith(key)),
		).toEqual(unavailable);
		const html = Bun.serve({
			port: 0,
			hostname: '127.0.0.1',
			fetch: () => new Response('<html>'),
		});
		try {
			expect(
				await createJwt({ jwks: `http://127.0.0.1:${html.port}/` }).verify(
					await signWith(key),
				),
			).toEqual(unavailable);
		} finally {
			html.stop(true);
		}
	});

	test('a cached set stays usable for staleMs, then the guard fails closed', async () => {
		const server = serve();
		const jwt = createJwt({
			jwks: server.jwksUrl,
			cacheMs: 1_000,
			refetchMs: 0,
			staleMs: 60_000,
		});
		const token = await signWith(key);
		expect((await jwt.verify(token)).ok).toBe(true);
		server.failing = true;
		later(30_000);
		expect((await jwt.verify(token)).ok).toBe(true);
		expect(server.hits['/jwks.json']).toBe(2);
		later(40_000);
		expect(await jwt.verify(token)).toEqual(unavailable);
	});

	test('staleMs: 0 refuses as soon as the set expires', async () => {
		const server = serve();
		const jwt = createJwt({
			jwks: server.jwksUrl,
			cacheMs: 1_000,
			refetchMs: 0,
			staleMs: 0,
		});
		const token = await signWith(key);
		expect((await jwt.verify(token)).ok).toBe(true);
		server.failing = true;
		later(1_001);
		expect(await jwt.verify(token)).toEqual(unavailable);
	});
});

describe('the cache', () => {
	test('a flood of unknown kids refetches once per refetchMs', async () => {
		const server = serve();
		const jwt = createJwt({ jwks: server.jwksUrl });
		const bad = await signWith(stranger);
		const results = await Promise.all(
			Array.from({ length: 50 }, () => jwt.verify(bad)),
		);
		expect(results.every((r) => !r.ok && r.reason === 'key')).toBe(true);
		for (let i = 0; i < 50; i++)
			await jwt.verify(await signWith(stranger, {}, { kid: `bad-${i}` }));
		expect(server.hits['/jwks.json']).toBe(1);
		later(30_001);
		await jwt.verify(bad);
		await jwt.verify(bad);
		expect(server.hits['/jwks.json']).toBe(2);
	});

	test('concurrent first requests share one fetch', async () => {
		const server = serve();
		const jwt = createJwt({ jwks: server.jwksUrl });
		const token = await signWith(key);
		const results = await Promise.all(
			Array.from({ length: 20 }, () => jwt.verify(token)),
		);
		expect(results.every((r) => r.ok)).toBe(true);
		expect(server.hits['/jwks.json']).toBe(1);
	});

	test('cacheMs is the lifetime without Cache-Control; max-age replaces it', async () => {
		const server = serve();
		const jwt = createJwt({
			jwks: server.jwksUrl,
			cacheMs: 100_000,
			refetchMs: 0,
		});
		const token = await signWith(key);
		await jwt.verify(token);
		later(99_000);
		await jwt.verify(token);
		expect(server.hits['/jwks.json']).toBe(1);
		later(2_000);
		await jwt.verify(token);
		expect(server.hits['/jwks.json']).toBe(2);

		const timed = serve();
		timed.headers = { 'cache-control': 'public, max-age=5' };
		const short = createJwt({
			jwks: timed.jwksUrl,
			cacheMs: 100_000,
			refetchMs: 0,
		});
		await short.verify(token);
		later(6_000);
		await short.verify(token);
		expect(timed.hits['/jwks.json']).toBe(2);
	});

	test('max-age never refetches faster than refetchMs, nor keeps a set past a day', async () => {
		const server = serve();
		server.headers = { 'cache-control': 'no-store, max-age=0' };
		const jwt = createJwt({ jwks: server.jwksUrl, refetchMs: 30_000 });
		const token = await signWith(key);
		await jwt.verify(token);
		later(10_000);
		await jwt.verify(token);
		expect(server.hits['/jwks.json']).toBe(1);
		const forever = serve();
		forever.headers = { 'cache-control': 'max-age=31536000' };
		const long = createJwt({ jwks: forever.jwksUrl, refetchMs: 0, staleMs: 0 });
		await long.verify(token);
		later(86_400_001);
		await long.verify(token);
		expect(forever.hits['/jwks.json']).toBe(2);
	});

	test('refresh() warms the cache at startup', async () => {
		const server = serve();
		const jwt = createJwt({ jwks: server.jwksUrl });
		await jwt.refresh();
		expect(server.hits['/jwks.json']).toBe(1);
		expect((await jwt.verify(await signWith(key))).ok).toBe(true);
		expect(server.hits['/jwks.json']).toBe(1);
	});
});
