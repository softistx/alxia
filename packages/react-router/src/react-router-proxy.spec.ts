import { describe, expect, test } from 'bun:test';
import { alxia, trustProxy } from '@alxia/core';
import { createServer, reactRouter } from '@alxia/react-router';
import type { ServerBuild } from 'react-router';
import { browser } from '../test/fixture';
import { build, loadBuild } from '../test/react-router-helpers';

loadBuild();

/** The fixture's build, recording the URL of each request its document entry renders. */
function recording(seen: string[]): ServerBuild {
	const render = build.entry.module.default;
	return {
		...build,
		entry: {
			module: {
				...build.entry.module,
				default: (request, ...rest) => {
					seen.push(request.url);
					return render(request, ...rest);
				},
			},
		},
	};
}

const from = (peer: string) =>
	({ requestIP: () => ({ address: peer }) }) as unknown as Bun.Server<unknown>;

const forwarded = {
	...browser,
	'x-forwarded-proto': 'https',
	'x-forwarded-host': 'example.com',
};

describe('behind a trusted proxy', () => {
	const served = (seen: string[]) =>
		alxia({ proxy: trustProxy({ trusted: ['10.0.0.0/8'] }) }).plugin((app) =>
			reactRouter(app, { build: recording(seen) }),
		);
	const ask = (seen: string[], peer: string, method = 'GET') =>
		served(seen).fetch(
			new Request('http://app.internal:3000/?tab=1', {
				method,
				headers: forwarded,
			}),
			from(peer),
		);

	test("React Router's request is at the URL the client asked for", async () => {
		const seen: string[] = [];
		expect((await ask(seen, '10.0.0.1')).status).toBe(200);
		expect(seen).toEqual(['https://example.com/?tab=1']);
	});

	test('a HEAD too, as its GET', async () => {
		const seen: string[] = [];
		const response = await ask(seen, '10.0.0.1', 'HEAD');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('');
		expect(seen).toEqual(['https://example.com/?tab=1']);
	});

	test('a direct client spoofing the headers keeps the request URL', async () => {
		const seen: string[] = [];
		await ask(seen, '198.51.100.4');
		expect(seen).toEqual(['http://app.internal:3000/?tab=1']);
	});

	test('without the option, the request as it came', async () => {
		const seen: string[] = [];
		const app = alxia().plugin((app) =>
			reactRouter(app, { build: recording(seen) }),
		);
		await app.request('/', { headers: forwarded });
		expect(seen).toEqual(['http://localhost/']);
	});

	test("createServer's proxy is the app's", async () => {
		const seen: string[] = [];
		const app = createServer({
			proxy: trustProxy({ trusted: ['10.0.0.0/8'] }),
			client: false,
		}).create({ build: recording(seen) });
		await app.fetch(
			new Request('http://app.internal:3000/', { headers: forwarded }),
			from('10.0.0.1'),
		);
		expect(seen).toEqual(['https://example.com/']);
	});
});
