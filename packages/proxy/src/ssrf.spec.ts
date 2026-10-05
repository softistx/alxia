/**
 * The upstream is fixed at declaration: nothing a request sends — its path,
 * its request line, its `Host` — can make the proxy call another host.
 * Each attempt names a real second server, which must never be reached.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { raw, serve, upstream } from '../test/upstream';
import { proxy } from './index';

/** The upstream, a server an attacker would like reached, and the app in front. */
function setup() {
	const target = upstream();
	const evil = upstream();
	const app = alxia().use(proxy(target.url));
	const url = serve(app);
	return { target, evil, evilHost: evil.url.host, url, app };
}

describe('a request cannot choose the upstream', () => {
	test('paths that look like a host stay paths', async () => {
		const { target, evil, evilHost, app } = setup();
		const paths = [
			`//${evilHost}/x`,
			`/http://${evilHost}/x`,
			`/%2F%2F${evilHost}/x`,
			`/@${evilHost}/x`,
			`/.%2e/%2e%2e//${evilHost}`,
		];
		for (const path of paths) {
			const response = await app.fetch(new Request(`http://app.local${path}`));
			expect(response.status).toBe(200);
		}
		expect(evil.seen).toHaveLength(0);
		expect(target.seen).toHaveLength(paths.length);
	});

	test('raw request lines: absolute-form, //host, a backslash, a foreign Host', async () => {
		const { target, evil, evilHost, url } = setup();
		const lines = [
			`GET http://${evilHost}/x HTTP/1.1\r\nHost: ${evilHost}\r\n`,
			`GET //${evilHost}/x HTTP/1.1\r\nHost: ${url.host}\r\n`,
			`GET /\\${evilHost}/x HTTP/1.1\r\nHost: ${url.host}\r\n`,
			`GET /x HTTP/1.1\r\nHost: ${evilHost}\r\nX-Forwarded-Host: ${evilHost}\r\n`,
		];
		for (const line of lines) {
			const answer = await raw(url, `${line}Connection: close\r\n\r\n`);
			expect(answer.startsWith('HTTP/1.1 200')).toBe(true);
		}
		expect(evil.seen).toHaveLength(0);
		expect(target.seen).toHaveLength(lines.length);
		for (const seen of target.seen) {
			expect(seen.headers.get('host')).toBe(target.url.host);
		}
	});

	test("a rewrite returning a URL is a path under the target, never the URL's host", async () => {
		const target = upstream();
		const evil = upstream();
		const app = alxia().use(
			proxy(target.url, { rewrite: () => evil.url.href }),
		);
		expect((await app.request('/anything')).status).toBe(200);
		expect(evil.seen).toHaveLength(0);
		expect(target.seen[0]?.url.pathname).toBe(`/${evil.url.href}`);
	});

	test("a rewrite that climbs out of the target's path is a 400, never sent", async () => {
		const target = upstream();
		const app = alxia().use(
			proxy(new URL('/public', target.url), { rewrite: () => '/../admin' }),
		);
		const response = await app.request('/x');
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'bad_request' });
		expect(target.seen).toHaveLength(0);
	});
});

describe('the target is checked where it is declared', () => {
	test('an absolute http(s) URL, without query, fragment or credentials', () => {
		expect(() => proxy('/relative')).toThrow(
			'proxy(): the target must be an absolute URL, http:// or https://; got "/relative"',
		);
		expect(() => proxy('file:///etc/passwd')).toThrow(
			'proxy(): the target must be an absolute URL, http:// or https://; got "file:///etc/passwd"',
		);
		expect(() => proxy('http://user:secret@up.internal')).toThrow(
			'carries a query, a fragment or credentials',
		);
		expect(() => proxy('http://up.internal/?to=x')).toThrow(
			'carries a query, a fragment or credentials',
		);
	});

	test('rewrite, rebase, timeout and bodyLimit', () => {
		expect(() => proxy('http://up.internal', { rewrite: 'api' })).toThrow(
			'proxy(): rewrite must be a path that starts with "/" and does not end with one; got "api"',
		);
		expect(() => proxy('http://up.internal', { rebase: '/api/' })).toThrow(
			'proxy(): rebase must be a path that starts with "/" and does not end with one; got "/api/"',
		);
		expect(() => proxy('http://up.internal', { timeout: 0 })).toThrow(
			'proxy(): timeout must be a number of milliseconds above 0; got 0',
		);
		expect(() => proxy('http://up.internal', { bodyLimit: -1 })).toThrow(
			'proxy(): bodyLimit must be a whole number of bytes, 0 or more; got -1',
		);
	});
});
