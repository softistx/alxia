/**
 * `redis(handle)` closes the handle when the last app serving it stops: forks
 * of one base share its onStop hook, and each runs it once of its own.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { defineCache, defineRedis, openRedis } from '@nxgt/redis';
import { z } from 'zod';
import { useRedis } from '../test/server';
import { redis } from './context';

const db = useRedis();

const note = defineCache({
	name: 'note',
	key: (id: string) => id,
	ttl: 60,
	schema: z.string(),
});
const open = () =>
	openRedis(defineRedis({ uri: db.uri, prefix: 'fork', caches: { note } }));
const serves = async (handle: Awaited<ReturnType<typeof open>>) =>
	(await handle.ping()).default.ok;
// `onStart` runs in a microtask after `listen`: let it run before the next step.
const listen = async (app: { listen: ReturnType<typeof alxia>['listen'] }) => {
	const server = app.listen({ port: 0, signals: false });
	await Bun.sleep(0);
	return server;
};

describe('redis(handle) with forks of one base', () => {
	test('one fork stops: the client still serves the sibling', async () => {
		const handle = await open();
		const base = alxia()
			.plugin(redis(handle))
			.get('/b', async ({ caches, reply }) =>
				reply(200, await caches.note.remember('x', () => 'served')),
			);
		const a = base.fork();
		const b = base.fork();
		await listen(a);
		const server = await listen(b);
		await a.stop();
		expect(await serves(handle)).toBe(true);
		const res = await fetch(`${server.url.href}b`);
		expect(await res.text()).toBe('served');
		await b.stop();
		expect(await serves(handle)).toBe(false);
	});

	test('both stop: the client is closed', async () => {
		const handle = await open();
		const base = alxia().plugin(redis(handle));
		const a = base.fork();
		const b = base.fork();
		await listen(a);
		await listen(b);
		await a.stop();
		expect(await serves(handle)).toBe(true);
		await b.stop();
		expect(await serves(handle)).toBe(false);
	});

	test("an unstarted fork's stop leaves the client to its serving sibling", async () => {
		const handle = await open();
		const base = alxia().plugin(redis(handle));
		const idle = base.fork();
		const serving = base.fork();
		await listen(serving);
		await idle.stop();
		expect(await serves(handle)).toBe(true);
		await serving.stop();
		expect(await serves(handle)).toBe(false);
	});

	test('one app that never listened closes the handle on stop, as before', async () => {
		const handle = await open();
		await alxia().plugin(redis(handle)).stop();
		expect(await serves(handle)).toBe(false);
	});

	test('one app that listened closes it on stop, once', async () => {
		const handle = await open();
		const app = alxia().plugin(redis(handle));
		await listen(app);
		await app.stop();
		expect(await serves(handle)).toBe(false);
		await app.stop();
	});
});
