/**
 * The operations of a socket, told to the observers around its upgrade: an
 * observer subscribed before `next()` is told of each operation's start,
 * then of its end, once; a request's context subscribes nothing; an
 * observer that throws costs the operation nothing.
 */
import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { alxia } from './alxia';
import type { OperationReport } from './operation';
import {
	type OperationObserver,
	type OperationOutcome,
	onOperation,
	startOperation,
} from './socket-operation';

let stop: (() => Promise<void>) | undefined;
afterEach(async () => {
	await stop?.();
	stop = undefined;
});

/**
 * A socket route whose upgrade is observed by `observers`, and whose each
 * message `{ type, name, outcome }` is an operation started and ended.
 */
async function socketWith(...observers: OperationObserver[]) {
	const subscribed: boolean[] = [];
	const app = alxia()
		.use((ctx, next) => {
			for (const observer of observers) {
				subscribed.push(onOperation(ctx, observer));
			}
			return next();
		})
		.ws('/s', {
			message(socket, message) {
				const { outcome, ...report } = JSON.parse(
					String(message),
				) as OperationReport & { outcome: OperationOutcome };
				const end = startOperation(socket.data, report);
				end(outcome);
				end('ok');
				socket.send('done');
			},
		});
	const server = app.listen({ port: 0, signals: false });
	stop = () => app.stop(true);
	const ws = new WebSocket(`ws://localhost:${server.port}/s`);
	await new Promise((resolve) => ws.addEventListener('open', resolve));
	const run = async (message: object) => {
		const done = new Promise((resolve) =>
			ws.addEventListener('message', resolve, { once: true }),
		);
		ws.send(JSON.stringify(message));
		await done;
	};
	return { run, subscribed };
}

describe('the operations of a socket', () => {
	test('each one is told at its start, then its end, once', async () => {
		const seen: string[] = [];
		const { run, subscribed } = await socketWith(({ type, name }) => {
			seen.push(`start ${type} ${name}`);
			return (outcome) => seen.push(`end ${type} ${name} ${outcome}`);
		});
		await run({ type: 'query', name: 'GetNotes', outcome: 'ok' });
		await run({ type: 'mutation', name: 'AddNote', outcome: 'errors' });
		expect(subscribed).toEqual([true]);
		expect(seen).toEqual([
			'start query GetNotes',
			'end query GetNotes ok',
			'start mutation AddNote',
			'end mutation AddNote errors',
		]);
	});

	test('every observer is told, and one that throws is logged and skipped', async () => {
		const logged = spyOn(console, 'error').mockImplementation(() => {});
		const seen: string[] = [];
		try {
			const { run } = await socketWith(
				() => {
					throw new Error('observer down');
				},
				() => () => {
					throw new Error('end down');
				},
				({ type }) =>
					(outcome) =>
						seen.push(`${type} ${outcome}`),
			);
			await run({ type: 'subscription', outcome: 'ok' });
			expect(seen).toEqual(['subscription ok']);
			expect(logged).toHaveBeenCalledTimes(2);
		} finally {
			logged.mockRestore();
		}
	});

	test('an observer that returns nothing is told of the start alone', async () => {
		const seen: string[] = [];
		const { run } = await socketWith(({ type }) => {
			seen.push(type);
			return undefined;
		});
		await run({ type: 'query', outcome: 'ok' });
		expect(seen).toEqual(['query']);
	});

	test("a request's context subscribes nothing, and tells no one", async () => {
		const seen: string[] = [];
		const observer: OperationObserver = ({ type }) => {
			seen.push(type);
			return undefined;
		};
		const subscribed: boolean[] = [];
		const app = alxia()
			.use((ctx, next) => {
				subscribed.push(onOperation(ctx, observer));
				return next();
			})
			.get('/q', (ctx) => {
				startOperation(ctx, { type: 'query' })('ok');
				return ctx.reply(200);
			});
		expect((await app.request('/q')).status).toBe(200);
		expect(subscribed).toEqual([false]);
		expect(seen).toEqual([]);
		startOperation({}, { type: 'query' })('ok');
		expect(onOperation({}, observer)).toBe(false);
	});
});
