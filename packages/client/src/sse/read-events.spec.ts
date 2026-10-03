import { describe, expect, test } from 'bun:test';
import { readEvents } from './read-events';

/** A body of `chunks`, each one sent as it is. */
function bodyOf(...chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		},
	});
}

async function read(...chunks: string[]): Promise<unknown[]> {
	const values: unknown[] = [];
	for await (const value of readEvents(bodyOf(...chunks))) values.push(value);
	return values;
}

describe('readEvents', () => {
	test('an event with no name reads as its data, as before', async () => {
		expect(await read('data: {"n":1}\n\n: keep-alive\n\ndata: 2\n\n')).toEqual([
			{ n: 1 },
			2,
		]);
	});

	test('a named event reads as { event, data }, with its id when it has one', async () => {
		expect(
			await read(
				'event: state\nid: s1\nretry: 5000\ndata: {"a":1}\n\n',
				'event: ping\ndata: {"interval":30}\n\n',
			),
		).toEqual([
			{ event: 'state', data: { a: 1 }, id: 's1' },
			{ event: 'ping', data: { interval: 30 } },
		]);
	});

	test('data on several lines is joined by line breaks', async () => {
		expect(await read('event: list\ndata: [1,\ndata: 2]\n\n')).toEqual([
			{ event: 'list', data: [1, 2] },
		]);
		expect(await read('data: "a\\nb"\n\n')).toEqual(['a\nb']);
	});

	test('CRLF and CR end lines too, even split across chunks', async () => {
		expect(
			await read('event: ping\r', '\ndata: 1\r\n\r', '\ndata: 2\r\rdata: 3'),
		).toEqual([{ event: 'ping', data: 1 }, 2, 3]);
	});

	test('a field without a space after its colon, an empty name, an id with a NUL', async () => {
		expect(
			await read(
				'event:ping\ndata:1\n\n',
				'event:\ndata: 2\n\n',
				'event: x\nid: a\0b\ndata: 3\n\n',
			),
		).toEqual([{ event: 'ping', data: 1 }, 2, { event: 'x', data: 3 }]);
	});

	test('an event with no data is not read, as an EventSource does not dispatch it', async () => {
		expect(await read('event: ping\n\nid: 1\n\ndata: 1\n\n')).toEqual([1]);
	});
});
