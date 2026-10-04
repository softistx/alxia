import { describe, expect, test } from 'bun:test';
import { constants, gunzipSync } from 'node:zlib';
import {
	alxia,
	type EventInput,
	eventStream,
	responds,
	validate,
} from '@alxia/core';
import { z } from 'zod';
import { compress } from './compress';

const StateChange = z.object({
	'@type': z.literal('StateChange'),
	changed: z.record(z.string(), z.record(z.string(), z.string())),
});
const Ping = z.object({ interval: z.number().int() });
const Push = eventStream({ state: StateChange, ping: Ping });

const PING = 'event: ping\ndata: {"interval":20}\n\n';
const STATE =
	'event: state\nid: s1\ndata: {"@type":"StateChange","changed":{"a1":{"Email":"s1"}}}\n\n';

/**
 * A push stream as a JMAP server writes one: a `ping` from a timer every
 * 20 ms, a `state` after 30 ms, and, with `closeAfterState`, the end of the
 * stream after it. The timer is released when the client leaves.
 */
function push(signal: AbortSignal, log: string[], closeAfterState: boolean) {
	return (async function* () {
		const queue: EventInput<typeof Push>[] = [];
		let wake: (() => void) | undefined;
		const timer = setInterval(() => {
			queue.push(Push.event('ping', { interval: 20 }));
			wake?.();
		}, 20);
		const state = setTimeout(() => {
			queue.push(
				Push.event(
					'state',
					{ '@type': 'StateChange', changed: { a1: { Email: 's1' } } },
					{ id: 's1' },
				),
			);
			wake?.();
		}, 30);
		const onAbort = () => {
			log.push('aborted');
			wake?.();
		};
		signal.addEventListener('abort', onAbort);
		try {
			while (!signal.aborted) {
				const next = queue.shift();
				if (next === undefined) {
					await new Promise<void>((resolve) => {
						wake = resolve;
					});
					continue;
				}
				yield next;
				if (next.event === 'state' && closeAfterState) return;
			}
		} finally {
			clearInterval(timer);
			clearTimeout(state);
			signal.removeEventListener('abort', onAbort);
			log.push('released');
		}
	})();
}

function appWith(log: string[], compressible?: (type: string) => boolean) {
	return alxia()
		.plugin(compress(compressible === undefined ? {} : { compressible }))
		.get(
			'/push',
			validate({
				query: z.object({ closeafter: z.enum(['state', 'no']).default('no') }),
			}),
			responds({ 200: Push }),
			({ query, request, reply }) =>
				reply(200, push(request.signal, log, query.closeafter === 'state')),
		);
}

/** What has been flushed so far of a gzip body, decoded. */
function gunzipped(chunks: Uint8Array[]): string {
	return gunzipSync(Buffer.concat(chunks), {
		finishFlush: constants.Z_SYNC_FLUSH,
	}).toString();
}

for (const compressed of [false, true]) {
	const label = compressed
		? 'behind compress, opted in: each event gzipped and flushed'
		: 'behind compress, by default: left as it is';
	describe(`a named event stream ${label}`, () => {
		const options = compressed ? () => true : undefined;

		/** The body read so far, as text, whatever its encoding. */
		const textOf = (chunks: Uint8Array[]) =>
			compressed
				? gunzipped(chunks)
				: new TextDecoder().decode(Buffer.concat(chunks));

		async function open(path: string, signal?: AbortSignal) {
			const log: string[] = [];
			const app = appWith(log, options);
			const server = app.listen({ port: 0 });
			const response = await fetch(new URL(path, server.url), {
				headers: { 'accept-encoding': 'gzip' },
				decompress: false,
				...(signal === undefined ? {} : { signal }),
			});
			expect(response.headers.get('content-type')).toBe('text/event-stream');
			expect(response.headers.get('content-encoding')).toBe(
				compressed ? 'gzip' : null,
			);
			const reader = response.body?.getReader();
			if (reader === undefined) throw new Error('no body');
			return { app, log, reader };
		}

		test('closeafter=state: a ping, the state, then the end of the stream', async () => {
			const { app, log, reader } = await open('/push?closeafter=state');
			try {
				const chunks: Uint8Array[] = [];
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					chunks.push(value);
				}
				expect(textOf(chunks)).toBe(PING + STATE);
				expect(log).toEqual(['released']);
			} finally {
				await app.stop(true);
			}
		});

		test('the timer ping arrives as it is sent, and a client that leaves releases the timer', async () => {
			const abort = new AbortController();
			const { app, log, reader } = await open('/push', abort.signal);
			try {
				const chunks: Uint8Array[] = [];
				// The stream never ends: what arrives is flushed as it is sent.
				while (!textOf(chunks).startsWith(PING)) {
					const { value } = await reader.read();
					if (value === undefined) throw new Error('ended early');
					chunks.push(value);
				}
				abort.abort();
				for (let i = 0; i < 100 && !log.includes('released'); i++) {
					await Bun.sleep(10);
				}
				expect(log).toEqual(['aborted', 'released']);
			} finally {
				await app.stop(true);
			}
		});
	});
}
