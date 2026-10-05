/** A JMAP-style push stream under listen: a timer's pings, a state, a client leaving. */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { change, Push, readAll } from '../../test/fixtures/events';
import { alxia } from '../app/alxia';
import { responds, validate } from '../app/validate';
import type { EventInput } from './named-events';

/** What a push handler did, in order. */
type Log = string[];

/**
 * A push stream as a JMAP server writes one: a `ping` every `interval`
 * milliseconds from a timer, a `state` whenever `changes` gives one, and,
 * with `closeAfterState`, the end of the stream after the first state. The
 * timer and the subscription are released when the client leaves.
 */
function push(
	signal: AbortSignal,
	log: Log,
	options: { interval: number; closeAfterState?: boolean; stateAfter?: number },
) {
	return (async function* () {
		const queue: EventInput<typeof Push>[] = [];
		let wake: (() => void) | undefined;
		const timer = setInterval(() => {
			queue.push({ event: 'ping', data: { interval: options.interval } });
			wake?.();
		}, options.interval);
		const state =
			options.stateAfter === undefined
				? undefined
				: setTimeout(() => {
						queue.push({ event: 'state', data: change, id: 's1' });
						wake?.();
					}, options.stateAfter);
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
				if (next.event === 'state' && options.closeAfterState === true) return;
			}
		} finally {
			clearInterval(timer);
			clearTimeout(state);
			signal.removeEventListener('abort', onAbort);
			log.push('released');
		}
	})();
}

/** The app of the push specs: `/push?closeafter=state` ends after the first state. */
function pushApp(log: Log) {
	return alxia().get(
		'/push',
		validate({
			query: z.object({ closeafter: z.enum(['state', 'no']).default('no') }),
		}),
		responds({ 200: Push }),
		({ query, request, reply }) =>
			reply(
				200,
				push(request.signal, log, {
					interval: 20,
					stateAfter: 30,
					closeAfterState: query.closeafter === 'state',
				}),
			),
	);
}

describe('a push stream, under listen', () => {
	test('a timer pings, a state follows, and closeafter=state ends the stream', async () => {
		const log: Log = [];
		const app = pushApp(log);
		const server = app.listen({ port: 0 });
		try {
			const response = await fetch(
				new URL('/push?closeafter=state', server.url),
			);
			const { text, error } = await readAll(response);
			expect(error).toBeUndefined();
			expect(text).toBe(
				'event: ping\ndata: {"interval":20}\n\n' +
					'event: state\nid: s1\ndata: {"@type":"StateChange","changed":{"a1":{"Email":"s1"}}}\n\n',
			);
			expect(log).toEqual(['released']);
		} finally {
			await app.stop(true);
		}
	});

	test('pings stream as the timer fires, not when the stream ends', async () => {
		const log: Log = [];
		const app = pushApp(log);
		const server = app.listen({ port: 0 });
		try {
			const abort = new AbortController();
			const response = await fetch(new URL('/push', server.url), {
				signal: abort.signal,
			});
			const reader = response.body?.getReader();
			if (reader === undefined) throw new Error('no body');
			// The stream never ends without closeafter: this is the timer's ping, sent at once.
			const first = await reader.read();
			expect(new TextDecoder().decode(first.value)).toStartWith(
				'event: ping\ndata: {"interval":20}\n\n',
			);
			abort.abort();
		} finally {
			await app.stop(true);
		}
	});

	test('a client that leaves aborts the request signal, and the timer is released', async () => {
		const log: Log = [];
		const app = pushApp(log);
		const server = app.listen({ port: 0 });
		try {
			const abort = new AbortController();
			const response = await fetch(new URL('/push', server.url), {
				signal: abort.signal,
			});
			const reader = response.body?.getReader();
			if (reader === undefined) throw new Error('no body');
			await reader.read();
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
