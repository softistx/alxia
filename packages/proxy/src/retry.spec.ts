import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { closedPort, named, resetter, slowBody } from '../test/pool';
import { serve, upstream } from '../test/upstream';
import { proxy } from './index';

describe('a retry, only when the request never reached the upstream', () => {
	test('a POST with a body goes whole to the next upstream after a refused connect', async () => {
		const live = named('live');
		const url = serve(alxia().use(proxy([closedPort(), live.up.url])));
		const response = await fetch(url, {
			method: 'POST',
			body: slowBody(['he', 'll', 'o']),
			duplex: 'half',
		} as RequestInit);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('live');
		expect(live.state.bodies).toEqual(['hello']);
	});

	test('a host that does not resolve is tried no further than the next upstream', async () => {
		const live = named('live');
		const app = alxia().use(proxy(['http://nowhere.invalid', live.up.url]));
		expect(await (await app.request('/')).text()).toBe('live');
	});

	test('a GET the upstream reset after receiving it is a 502, not retried', async () => {
		const reset = await resetter();
		const live = named('live');
		const app = alxia().use(proxy([reset.url, live.up.url]));
		const response = await app.request('/');
		expect(response.status).toBe(502);
		expect(reset.state.connections).toBe(1);
		expect(live.state.requests).toBe(0);
	});

	test('a POST reset mid-body is a 502, not retried', async () => {
		const reset = await resetter(200); // past the request line and headers
		const live = named('live');
		const url = serve(alxia().use(proxy([reset.url, live.up.url])));
		const response = await fetch(url, {
			method: 'POST',
			body: slowBody(['a'.repeat(100), 'b'.repeat(100), 'c'.repeat(100)]),
			duplex: 'half',
		} as RequestInit);
		expect(response.status).toBe(502);
		expect(reset.state.received).toBeGreaterThanOrEqual(200);
		expect(live.state.requests).toBe(0);
	});

	test('an upstream reset is not cooled down: it stays in the rotation', async () => {
		const reset = await resetter();
		const live = named('live');
		const app = alxia().use(proxy([reset.url, live.up.url]));
		expect((await app.request('/')).status).toBe(502);
		expect(await (await app.request('/')).text()).toBe('live');
		expect((await app.request('/')).status).toBe(502);
		expect(reset.state.connections).toBe(2);
	});

	test('a timeout is a 504, not retried: the upstream received the request', async () => {
		let started = 0;
		const hanging = upstream(() => {
			started++;
			return new Promise<Response>(() => {});
		});
		const live = named('live');
		const app = alxia().use(
			proxy([hanging.url, live.up.url], { timeout: 100 }),
		);
		const response = await app.request('/', {
			method: 'POST',
			body: 'sent',
		});
		expect(response.status).toBe(504);
		expect(await response.json()).toEqual({ error: 'gateway_timeout' });
		expect(started).toBe(1);
		expect(live.state.requests).toBe(0);
		// A GET too, which has no body to guard it: the timeout alone says no.
		const again = alxia().use(
			proxy([hanging.url, live.up.url], { timeout: 100 }),
		);
		expect((await again.request('/')).status).toBe(504);
		expect(started).toBe(2);
		expect(live.state.requests).toBe(0);
	});

	test('an answer of any status is the upstream’s: a 503 is passed back, not retried', async () => {
		const busy = upstream(() => new Response('busy', { status: 503 }));
		const live = named('live');
		const app = alxia().use(proxy([busy.url, live.up.url]));
		const response = await app.request('/');
		expect(response.status).toBe(503);
		expect(live.state.requests).toBe(0);
	});
});
