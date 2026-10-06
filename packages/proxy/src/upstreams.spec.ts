import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { closedPort, named } from '../test/pool';
import { proxy } from './index';

describe('several upstreams', () => {
	test('requests go round-robin, in the order given', async () => {
		const a = named('a');
		const b = named('b');
		const c = named('c');
		const app = alxia().use(proxy([a.up.url, b.up.url, c.up.url]));
		const answered: string[] = [];
		for (let i = 0; i < 6; i++) {
			answered.push(await (await app.request('/')).text());
		}
		expect(answered).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
	});

	test('a dead upstream is skipped for the request, then for cooldown ms', async () => {
		const dead = closedPort();
		const live = named('live');
		const app = alxia().use(proxy([dead.href, live.up.url], { cooldown: 300 }));
		const first = await app.request('/');
		expect(first.status).toBe(200);
		expect(await first.text()).toBe('live');
		// It comes back, but cools down: every request still goes to `live`.
		const revived = named('revived', Number(dead.port));
		for (let i = 0; i < 4; i++) {
			expect(await (await app.request('/')).text()).toBe('live');
		}
		expect(revived.state.requests).toBe(0);
		await Bun.sleep(320);
		const after: string[] = [];
		for (let i = 0; i < 2; i++) {
			after.push(await (await app.request('/')).text());
		}
		expect(after.sort()).toEqual(['live', 'revived']);
	});

	test('every upstream down is a 502', async () => {
		const app = alxia().use(proxy([closedPort(), closedPort()]));
		const response = await app.request('/');
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ error: 'bad_gateway' });
	});

	test('when every upstream cools down, the one that failed longest ago is tried', async () => {
		const first = closedPort();
		const middle = named('middle');
		const last = closedPort();
		const app = alxia().use(
			proxy([first, middle.up.url, last], { cooldown: 60_000, retries: 0 }),
		);
		expect((await app.request('/')).status).toBe(502); // `first` fails, and cools
		expect(await (await app.request('/')).text()).toBe('middle');
		expect((await app.request('/')).status).toBe(502); // `last` fails, and cools
		expect(await (await app.request('/')).text()).toBe('middle');
		await middle.up.server.stop(true);
		expect((await app.request('/')).status).toBe(502); // `middle` fails: all three cool
		// Next in turn is `last`; `first` failed longest ago, and is back.
		const back = named('first', Number(first.port));
		const response = await app.request('/');
		expect(await response.text()).toBe('first');
		expect(back.state.requests).toBe(1);
	});

	test('retries: 0 answers the 502 of the first upstream, without trying another', async () => {
		const live = named('live');
		const app = alxia().use(proxy([closedPort(), live.up.url], { retries: 0 }));
		expect((await app.request('/')).status).toBe(502);
		expect(live.state.requests).toBe(0);
	});
});

describe('the list, checked where it is declared', () => {
	test('an empty list is refused', () => {
		expect(() => proxy([])).toThrow('give one upstream URL, or a list');
	});

	test('each upstream is checked as a single target is', () => {
		expect(() =>
			proxy(['http://a.internal', 'http://user:pw@b.internal']),
		).toThrow('carries a query, a fragment or credentials');
		expect(() => proxy.ws(['ws://a.internal', 'ftp://b.internal'])).toThrow(
			'the target must be an absolute URL',
		);
	});

	test('retries past the number of upstreams − 1, or not a whole number, are refused', () => {
		expect(() =>
			proxy(['http://a.internal', 'http://b.internal'], { retries: 2 }),
		).toThrow('retries must be at most the number of upstreams − 1 (1)');
		expect(() => proxy('http://a.internal', { retries: 1 })).toThrow(
			'retries must be at most',
		);
		expect(() => proxy('http://a.internal', { retries: -1 })).toThrow(
			'retries must be a whole number',
		);
		expect(() => proxy('http://a.internal', { cooldown: 1.5 })).toThrow(
			'cooldown must be a whole number',
		);
	});

	test('proxy.mount takes a list too', async () => {
		const a = named('a');
		const b = named('b');
		const app = alxia().plugin(proxy.mount('/old', [a.up.url, b.up.url]));
		const answered = [
			await (await app.request('/old/x')).text(),
			await (await app.request('/old/y')).text(),
		];
		expect(answered).toEqual(['a', 'b']);
	});
});
