import { describe, expect, test } from 'bun:test';
import { reactRouter } from '@alxia/react-router';
import { createEntry } from '@alxia/react-router/entry';
import type {
	EntryContext,
	RouterContextProvider,
	ServerBuild,
} from 'react-router';
import { makeBase } from '../../fixture/base';
import { browser } from '../../test/fixture';
import { build, loadBuild } from '../../test/react-router-helpers';

loadBuild();

/** A router context and a load context that throw when anything reads them: a render would. */
const refuses = <T extends object>(): T =>
	new Proxy({} as T, {
		get(_target, property) {
			throw new Error(`rendered: read ${String(property)}`);
		},
	});

const URL_ = 'http://localhost/page';

describe('handleRequest, called directly', () => {
	test('HEAD: a null body, the status and text/html, and no render', async () => {
		const { handleRequest } = createEntry({
			nonce: () => {
				throw new Error('rendered: asked for the nonce');
			},
		});
		const response = await handleRequest(
			new Request(URL_, { method: 'HEAD' }),
			204,
			new Headers({ 'x-kept': 'yes' }),
			refuses<EntryContext>(),
			refuses<RouterContextProvider>(),
		);
		expect(response.status).toBe(204);
		expect(response.body).toBeNull();
		expect(response.headers.get('content-type')).toBe('text/html');
		expect(response.headers.get('x-kept')).toBe('yes');
	});

	test('a client that leaves while a bot waits for the whole page stops the render', async () => {
		const entry = createEntry({ isBot: () => true, onError: () => {} });
		const own: ServerBuild = {
			...build,
			entry: {
				...build.entry,
				module: { ...build.entry.module, default: entry.handleRequest },
			},
		};
		const controller = new AbortController();
		const started = performance.now();
		setTimeout(() => controller.abort(), 100);
		// /hang never finishes: without the client's signal the bot waits streamTimeout + 1 000 ms.
		await makeBase()
			.plugin((base) => reactRouter(base, { build: own }))
			.request('/hang', { headers: browser, signal: controller.signal })
			.catch(() => undefined);
		expect(performance.now() - started).toBeLessThan(3_000);
	}, 10_000);
});
