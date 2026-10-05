import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import { change, Ping, Push, StateChange } from '../../test/fixtures/events';
import { alxia } from '../app/alxia';
import { responds } from '../app/validate';
import { eventStream, isEventStreamSchema } from './event-stream';
import { type EventInput, isNamedEventStreamSchema } from './named-events';

describe('eventStream({ name: schema })', () => {
	const app = alxia().get('/push', responds({ 200: Push }), ({ reply }) =>
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
			responds({ 200: Pings }),
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
		const notes = alxia().get('/notes', responds({ 200: Notes }), ({ reply }) =>
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
});

describe('eventStream({ name: schema }), its types', () => {
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
		alxia().get('/typed', responds({ 200: Push }), ({ reply }) =>
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

	test('a named stream is told apart from an unnamed one', () => {
		expect(isNamedEventStreamSchema(Push)).toBe(true);
		expect(isEventStreamSchema(Push)).toBe(false);
		expect(isNamedEventStreamSchema(eventStream(Ping))).toBe(false);
		expect(Push['~events']).toEqual({ state: StateChange, ping: Ping });
	});
});

describe('the unnamed form is unchanged', () => {
	test('a value shaped like an event is sent as the JSON of its data', async () => {
		const Loose = z.object({ event: z.string(), data: z.number() });
		const app = alxia()
			.get('/loose', responds({ 200: eventStream(Loose) }), ({ reply }) =>
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
