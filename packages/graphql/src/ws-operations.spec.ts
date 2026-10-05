/**
 * The operations of one socket, by their `graphql-ws` id: each told to the
 * upgrade's observers at its start and once at its end; an id reused while
 * open ends the first before the second starts; a document naming no
 * operation tells no one; the socket's close ends what is still open.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { alxia, onOperation } from '@alxia/core';
import { parse } from 'graphql';
import { SocketOperations } from './ws-operations';

let stop: (() => Promise<void>) | undefined;
afterEach(async () => {
	await stop?.();
	stop = undefined;
});

/** Runs `use` with the operations of a real socket whose upgrade is observed into `seen`. */
async function onSocket(
	use: (operations: SocketOperations) => void,
): Promise<string[]> {
	const seen: string[] = [];
	const app = alxia()
		.use((ctx, next) => {
			onOperation(ctx, ({ type, name }) => {
				seen.push(`start ${type} ${name}`);
				return (outcome) => seen.push(`end ${type} ${name} ${outcome}`);
			});
			return next();
		})
		.ws('/socket', {
			message(socket) {
				use(new SocketOperations(socket.data));
				socket.send('done');
			},
		});
	const server = app.listen({ port: 0, signals: false });
	stop = () => app.stop(true);
	const ws = new WebSocket(`ws://localhost:${server.port}/socket`);
	await new Promise((resolve) => ws.addEventListener('open', resolve));
	const done = new Promise((resolve) =>
		ws.addEventListener('message', resolve),
	);
	ws.send('go');
	await done;
	return seen;
}

describe('the operations of one socket', () => {
	test('an id reused while open ends the first before the second starts', async () => {
		const seen = await onSocket((operations) => {
			operations.begin('1', parse('query A { a }'), undefined);
			operations.begin('1', parse('query B { b }'), undefined);
			operations.end('1');
			operations.end('1');
		});
		expect(seen).toEqual([
			'start query A',
			'end query A ok',
			'start query B',
			'end query B ok',
		]);
	});

	test('a failed operation ends with errors, a close ends what is open, an unknown name tells no one', async () => {
		const seen = await onSocket((operations) => {
			operations.begin('1', parse('mutation M { m }'), undefined);
			operations.failed('1');
			operations.end('1');
			operations.begin('2', parse('subscription S { s }'), undefined);
			operations.begin('3', parse('query Q { q }'), 'Other');
			operations.failed('3');
			operations.end('3');
			operations.closed();
		});
		expect(seen).toEqual([
			'start mutation M',
			'end mutation M errors',
			'start subscription S',
			'end subscription S errors',
		]);
	});
});
