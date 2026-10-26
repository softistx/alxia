/**
 * A streamed response (server-sent events, multipart) leaves no listener on
 * the app's shutdown signal, however it ends: read to its end, cancelled by
 * the client, or failed by its source. While it is open, shutting down still
 * ends it.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { alxia, shutdownSignal } from '@alxia/core';
import { createSchema } from 'graphql-yoga';
import { graphql } from './graphql';

const schema = createSchema({
	typeDefs: /* GraphQL */ `
		type Query { serverTime: String! }
		type Subscription { ticks: Int! }
	`,
	resolvers: {
		Query: { serverTime: () => 'now' },
		Subscription: {
			ticks: {
				async *subscribe() {
					for (let n = 0; ; n++) {
						yield { ticks: n };
						await Bun.sleep(20);
					}
				},
			},
		},
	},
});

const post = (query: string): RequestInit => ({
	method: 'POST',
	headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
	body: JSON.stringify({ query }),
});

// A middleware before the endpoint counts the abort listeners the app's
// shutdown signal holds (a listener added and not removed), since only a request's context reaches it.
let added = 0;
const listening = new Set<unknown>();
const watched = new WeakSet<AbortSignal>();
const held = () => listening.size;
const counting = (ctx: object) => {
	const signal = shutdownSignal(ctx);
	if (watched.has(signal)) return;
	watched.add(signal);
	const add = signal.addEventListener.bind(signal);
	const remove = signal.removeEventListener.bind(signal);
	signal.addEventListener = (type: string, ...rest: [never, never]) => {
		if (type === 'abort') {
			added++;
			listening.add(rest[0]);
		}
		return add(type, ...rest);
	};
	signal.removeEventListener = (type: string, ...rest: [never, never]) => {
		if (type === 'abort') listening.delete(rest[0]);
		return remove(type, ...rest);
	};
};
afterEach(() => {
	added = 0;
	listening.clear();
});

const app = (options: Partial<Parameters<typeof graphql>[1]> = {}) =>
	alxia()
		.use((ctx, next) => {
			counting(ctx);
			return next();
		})
		.plugin((app) => graphql(app, { schema, ide: false, ...options }));

describe('a streamed response and the shutdown signal', () => {
	test('responses read to their end leave no listener', async () => {
		const served = app();
		for (let n = 0; n < 20; n++) {
			const response = await served.request('/graphql', post('{ serverTime }'));
			expect(response.headers.get('content-type')).toContain(
				'text/event-stream',
			);
			await response.text();
		}
		expect(added).toBeGreaterThanOrEqual(20);
		expect(held()).toBe(0);
	});

	test('a client cancelling mid-stream leaves no listener', async () => {
		const served = app();
		for (let n = 0; n < 5; n++) {
			const response = await served.request(
				'/graphql',
				post('subscription { ticks }'),
			);
			const reader = response.body?.getReader();
			await reader?.read();
			await reader?.cancel();
		}
		expect(held()).toBe(0);
	});

	test('a source that errors leaves no listener', async () => {
		const failing = app({
			plugins: [
				{
					onResponse({ setResponse }) {
						setResponse(
							new Response(
								new ReadableStream({
									pull() {
										throw new Error('the source failed');
									},
								}),
								{ headers: { 'content-type': 'text/event-stream' } },
							),
						);
					},
				},
			],
		});
		const response = await failing.request('/graphql', post('{ serverTime }'));
		await response.text().catch(() => undefined);
		expect(held()).toBe(0);
	});

	test('shutting down still ends an open stream', async () => {
		const served = app();
		const server = served.listen({ port: 0, signals: false });
		const response = await fetch(
			`${server.url.href}graphql`,
			post('subscription { ticks }'),
		);
		const reader = response.body?.getReader();
		await reader?.read();
		const stopping = served.stop();
		let ended = false;
		while (!ended) ended = (await reader?.read())?.done ?? true;
		await stopping;
		expect(ended).toBe(true);
	});
});
