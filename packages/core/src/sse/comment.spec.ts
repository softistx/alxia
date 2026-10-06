import {
	afterEach,
	describe,
	expect,
	expectTypeOf,
	spyOn,
	test,
} from 'bun:test';
import { z } from 'zod';
import { Ping, Push, readAll } from '../../test/fixtures/events';
import { alxia } from '../app/alxia';
import { responds } from '../app/validate';
import { type SseComment, sseComment } from './comment';
import { eventStream, KEEP_ALIVE_MS, toEventStream } from './event-stream';

const Tick = z.object({ n: z.number() });

/** What a schemaless stream answers with `items` yielded. */
async function plain(items: () => AsyncGenerator<unknown>): Promise<string> {
	const app = alxia().get('/', ({ reply }) => reply(200, items()));
	return (await app.request('/')).text();
}

describe('sseComment', () => {
	test('is written as one `:` line and a blank line', async () => {
		expect(
			await plain(async function* () {
				yield sseComment('hello');
			}),
		).toBe(': hello\n\n');
	});

	test('several lines are several `:` lines in one block, whatever the break', async () => {
		expect(
			await plain(async function* () {
				yield sseComment('a\nb\r\nc\rd');
			}),
		).toBe(': a\n: b\n: c\n: d\n\n');
	});

	test('an empty comment is still a comment line', async () => {
		expect(
			await plain(async function* () {
				yield sseComment('');
			}),
		).toBe(': \n\n');
	});

	test('a line break cannot end the comment and start an event', async () => {
		const text = await plain(async function* () {
			yield sseComment('x\n\ndata: x\nevent: boom\r\rid: 9');
		});
		expect(text).toBe(': x\n: \n: data: x\n: event: boom\n: \n: id: 9\n\n');
		expect(text.indexOf('\n\n')).toBe(text.length - 2);
		expect(
			text
				.slice(0, -2)
				.split('\n')
				.every((line) => line.startsWith(':')),
		).toBe(true);
	});

	test('is interleaved with events of an unnamed stream, unchecked by its schema', async () => {
		const app = alxia().get(
			'/',
			responds({ 200: eventStream(Tick) }),
			({ reply }) =>
				reply(
					200,
					(async function* () {
						yield sseComment('start');
						yield { n: 1 };
						yield sseComment('between');
						yield { n: 2 };
					})(),
				),
		);
		expect(await (await app.request('/')).text()).toBe(
			': start\n\ndata: {"n":1}\n\n: between\n\ndata: {"n":2}\n\n',
		);
	});

	test('is interleaved with the events of a named stream', async () => {
		const app = alxia().get('/', responds({ 200: Push }), ({ reply }) =>
			reply(
				200,
				(async function* () {
					yield sseComment('before');
					yield Push.event('ping', { interval: 30 }, { id: 'p1' });
					yield sseComment('after');
				})(),
			),
		);
		const { text, error } = await readAll(await app.request('/'));
		expect(error).toBeUndefined();
		expect(text).toBe(
			': before\n\nevent: ping\nid: p1\ndata: {"interval":30}\n\n: after\n\n',
		);
	});

	test('a comment on a stream whose responses are not validated is still written', async () => {
		const app = alxia({ validateResponses: false }).get(
			'/',
			responds({ 200: Push }),
			({ reply }) =>
				reply(
					200,
					(async function* () {
						yield sseComment('x');
						yield Push.event('ping', { interval: 1 });
					})(),
				),
		);
		expect(await (await app.request('/')).text()).toBe(
			': x\n\nevent: ping\ndata: {"interval":1}\n\n',
		);
	});

	test('an event the schema refuses is still refused beside a comment', async () => {
		const app = alxia().get(
			'/',
			responds({ 200: eventStream(Tick) }),
			({ reply }) =>
				reply(
					200,
					(async function* () {
						yield sseComment('ok');
						yield { n: 'x' } as never;
					})(),
				),
		);
		const log = spyOn(console, 'error').mockImplementation(() => {});
		const read = await readAll(await app.request('/'));
		log.mockRestore();
		expect(read.text).toBe(': ok\n\n');
		expect(read.error).toBeInstanceOf(TypeError);
	});

	test('is typed on both kinds of stream, and refuses a non-string', () => {
		expectTypeOf(sseComment('x')).toEqualTypeOf<SseComment>();
		const Pings = eventStream(Ping);
		const items = (async function* () {
			yield sseComment('x');
			yield { interval: 1 };
		})();
		type Input = NonNullable<(typeof Pings)['~standard']['types']>['input'];
		expectTypeOf(items).toExtend<Input>();
		const named = Push['~standard'].types?.input;
		expectTypeOf(named).not.toBeNever();
		expect(() => sseComment(1 as never)).toThrow(TypeError);
	});
});

describe('the keep-alive', () => {
	afterEach(() => {
		spyOn(globalThis, 'setInterval').mockRestore();
	});

	test('is still `: keep-alive` every KEEP_ALIVE_MS while nothing is sent', async () => {
		let tick: (() => void) | undefined;
		let period: number | undefined;
		spyOn(globalThis, 'setInterval').mockImplementation(((
			fn: () => void,
			ms: number,
		) => {
			tick = fn;
			period = ms;
			return 0;
		}) as never);
		const controller = new AbortController();
		const stream = toEventStream(
			(async function* () {
				await new Promise(() => {});
				yield 1;
			})(),
			controller.signal,
		);
		const reader = stream.getReader();
		const pending = reader.read();
		expect(period).toBe(KEEP_ALIVE_MS);
		tick?.();
		const { value } = await pending;
		expect(new TextDecoder().decode(value)).toBe(': keep-alive\n\n');
		controller.abort();
	});
});
