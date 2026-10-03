import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import { alxia, type RoutesOf } from '../app/alxia';
import { eventStream, isEventStreamSchema } from './event-stream';
import { type EventInput, isNamedEventStreamSchema } from './named-events';

const StateChange = z.object({
	'@type': z.literal('StateChange'),
	changed: z.record(z.string(), z.record(z.string(), z.string())),
});
const Ping = z.object({ interval: z.number().int() });
const Push = eventStream({ state: StateChange, ping: Ping });

const change = {
	'@type': 'StateChange',
	changed: { a1: { Email: 's1' } },
} as const;

/** The body of `response` as text, with the error it ended with, if any. */
async function readAll(
	response: Response,
): Promise<{ text: string; error: unknown }> {
	const reader = response.body?.getReader();
	if (reader === undefined) throw new Error('no body');
	const decoder = new TextDecoder();
	let text = '';
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) return { text, error: undefined };
			text += decoder.decode(value, { stream: true });
		}
	} catch (error) {
		return { text, error };
	}
}

/** Runs `body` with `console.error` collected instead of printed. */
async function quietly<T>(body: (logged: unknown[]) => Promise<T>): Promise<T> {
	const original = console.error;
	const logged: unknown[] = [];
	console.error = (...args: unknown[]) => logged.push(...args);
	try {
		return await body(logged);
	} finally {
		console.error = original;
	}
}

describe('eventStream({ name: schema })', () => {
	const app = alxia().get('/push', { response: { 200: Push } }, ({ reply }) =>
		reply(
			200,
			(async function* () {
				yield Push.event('state', change, { id: 's1', retry: 5000 });
				yield Push.event('ping', { interval: 30 });
			})(),
		),
	);

	test('each event is written with its name, its id and its retry, byte for byte', async () => {
		const response = await app.request('/push');
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		expect(await response.text()).toBe(
			'event: state\nid: s1\nretry: 5000\ndata: {"@type":"StateChange","changed":{"a1":{"Email":"s1"}}}\n\n' +
				'event: ping\ndata: {"interval":30}\n\n',
		);
	});

	test('the data is sent as its schema gives it back', async () => {
		const Pings = eventStream({ ping: Ping });
		const stripped = alxia().get(
			'/stripped',
			{ response: { 200: Pings } },
			({ reply }) =>
				reply(
					200,
					(async function* () {
						const extra = { interval: 1, secret: 'x' };
						yield Pings.event('ping', extra);
					})(),
				),
		);
		expect(await (await stripped.request('/stripped')).text()).toBe(
			'event: ping\ndata: {"interval":1}\n\n',
		);
	});

	test('data with line breaks stays on one data line, its breaks escaped by JSON', async () => {
		const Notes = eventStream({ note: z.string() });
		const notes = alxia().get(
			'/notes',
			{ response: { 200: Notes } },
			({ reply }) =>
				reply(
					200,
					(async function* () {
						yield Notes.event('note', 'one\ntwo\r\nthree\rfour');
					})(),
				),
		);
		expect(await (await notes.request('/notes')).text()).toBe(
			'event: note\ndata: "one\\ntwo\\r\\nthree\\rfour"\n\n',
		);
	});

	test('the handler may yield only a declared event, with data its schema accepts', () => {
		// @ts-expect-error: `pong` is not one of the stream's events
		Push.event('pong', { interval: 1 });
		// @ts-expect-error: a ping's data is `{ interval: number }`
		Push.event('ping', change);
		// @ts-expect-error: `retry` is a number of milliseconds
		Push.event('ping', { interval: 1 }, { retry: '5' });
		expectTypeOf(Push.event('ping', { interval: 1 })).toEqualTypeOf<{
			readonly event: 'ping';
			readonly data: { interval: number };
			readonly id?: string;
			readonly retry?: number;
		}>();
		alxia().get('/typed', { response: { 200: Push } }, ({ reply }) =>
			reply(
				200,
				(async function* (): AsyncGenerator<EventInput<typeof Push>> {
					yield { event: 'ping', data: { interval: 1 } };
					// @ts-expect-error: `pong` is not one of the stream's events
					yield { event: 'pong', data: { interval: 1 } };
				})(),
			),
		);
	});

	test('the client reads a union of the events, discriminated by event, as they cross the wire', () => {
		type Data = Extract<
			RoutesOf<typeof app>['/push']['GET']['output'],
			{ status: 200 }
		>['data'];
		type Event = Data extends AsyncIterable<infer Item> ? Item : never;
		expectTypeOf<Event>().toEqualTypeOf<
			| {
					event: 'state';
					data: {
						'@type': 'StateChange';
						changed: Record<string, Record<string, string>>;
					};
					id?: string;
			  }
			| {
					event: 'ping';
					data: { interval: number };
					id?: string;
			  }
		>();
	});

	test('a named stream is told apart from an unnamed one', () => {
		expect(isNamedEventStreamSchema(Push)).toBe(true);
		expect(isEventStreamSchema(Push)).toBe(false);
		expect(isNamedEventStreamSchema(eventStream(Ping))).toBe(false);
		expect(Push['~events']).toEqual({ state: StateChange, ping: Ping });
	});
});

describe('what would write a frame the handler never yielded is refused', () => {
	/** The stream of an app that yields `frames`, cast past the types. */
	async function streamOf(
		frames: unknown[],
		options: { validateResponses?: boolean } = {},
	) {
		const app = alxia(options).get(
			'/push',
			{ response: { 200: Push } },
			({ reply }) =>
				reply(
					200,
					(async function* () {
						yield { event: 'ping', data: { interval: 1 } } as const;
						for (const frame of frames)
							yield frame as EventInput<{ ping: typeof Ping }>;
					})(),
				),
		);
		return quietly(async (logged) => ({
			...(await readAll(await app.request('/push'))),
			logged,
		}));
	}

	const first = 'event: ping\ndata: {"interval":1}\n\n';

	for (const validateResponses of [true, false]) {
		describe(`validateResponses: ${validateResponses}`, () => {
			test('an id with a line break ends the stream before it is written', async () => {
				for (const id of ['1\ndata: forged', '1\rx', '1\0']) {
					const { text, error, logged } = await streamOf(
						[{ event: 'ping', data: { interval: 2 }, id }],
						{ validateResponses },
					);
					expect(text).toBe(first);
					expect(error).toBeDefined();
					expect(String(logged[0])).toContain(
						'An event id must not hold a line break or a NUL',
					);
				}
			});

			test('a retry that is not a whole number of milliseconds ends the stream', async () => {
				for (const retry of [1.5, -1, '5', Number.NaN]) {
					const { text, error, logged } = await streamOf(
						[{ event: 'ping', data: { interval: 2 }, retry }],
						{ validateResponses },
					);
					expect(text).toBe(first);
					expect(error).toBeDefined();
					expect(String(logged[0])).toContain(
						'An event retry must be a whole number of milliseconds, 0 or more',
					);
				}
			});

			test('an undeclared event, or one with a line break in its name, ends the stream', async () => {
				for (const event of ['pong', 'ping\ndata: forged', undefined]) {
					const { text, error, logged } = await streamOf(
						[{ event, data: { interval: 2 } }],
						{ validateResponses },
					);
					expect(text).toBe(first);
					expect(error).toBeDefined();
					expect(String(logged[0])).toContain('is not declared: state, ping');
				}
			});

			test('a value that is not { event, data } ends the stream', async () => {
				const { text, logged } = await streamOf([{ interval: 2 }], {
					validateResponses,
				});
				expect(text).toBe(first);
				expect(String(logged[0])).toContain(
					'An event of a named stream is an object { event, data }',
				);
			});
		});
	}

	test('data its schema refuses ends the stream, named by its event', async () => {
		const { text, logged } = await streamOf([
			{ event: 'ping', data: { interval: 'x' } },
		]);
		expect(text).toBe(first);
		expect(String(logged[0])).toContain(
			'An event does not match its schema: ping.interval:',
		);
	});

	test('without validation, the data is not checked, but the event is still named', async () => {
		const { text, error } = await streamOf(
			[{ event: 'ping', data: { interval: 'x' } }],
			{ validateResponses: false },
		);
		expect(error).toBeUndefined();
		expect(text).toBe(`${first}event: ping\ndata: {"interval":"x"}\n\n`);
	});

	test('a name that cannot be written is refused when the stream is declared', () => {
		expect(() => eventStream({ 'a\nb': Ping })).toThrow(
			'An event name must not hold a line break or a NUL: "a\\nb"',
		);
		expect(() => eventStream({ 'a\rb': Ping })).toThrow(
			'An event name must not hold a line break or a NUL',
		);
		// @ts-expect-error: an empty name is refused by the types too
		expect(() => eventStream({ '': Ping })).toThrow(
			'An event name must not be empty',
		);
		// @ts-expect-error: a stream of no event is refused by the types too
		expect(() => eventStream({})).toThrow(
			'A named event stream declares at least one event',
		);
		expect(() =>
			eventStream({ ping: { interval: 1 } as unknown as typeof Ping }),
		).toThrow('The event "ping" is not a Standard Schema');
		const Odd = eventStream({ '~standard': Ping });
		expect(isNamedEventStreamSchema(Odd)).toBe(true);
	});
});

describe('the unnamed form is unchanged', () => {
	test('a value shaped like an event is sent as the JSON of its data', async () => {
		const Loose = z.object({ event: z.string(), data: z.number() });
		const app = alxia()
			.get('/loose', { response: { 200: eventStream(Loose) } }, ({ reply }) =>
				reply(
					200,
					(async function* () {
						yield { event: 'state', data: 1 };
					})(),
				),
			)
			.get('/free', ({ reply }) =>
				reply(
					200,
					(async function* () {
						yield { event: 'state', data: 1, id: 'x\ny' };
					})(),
				),
			);
		expect(await (await app.request('/loose')).text()).toBe(
			'data: {"event":"state","data":1}\n\n',
		);
		expect(await (await app.request('/free')).text()).toBe(
			'data: {"event":"state","data":1,"id":"x\\ny"}\n\n',
		);
	});
});

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
		{
			query: z.object({ closeafter: z.enum(['state', 'no']).default('no') }),
			response: { 200: Push },
		},
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
