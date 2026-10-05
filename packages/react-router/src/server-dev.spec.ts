/**
 * The dev switch of the app `createServer` makes: React Router's mode
 * decides, so a production build never shows a stack, whatever
 * `NODE_ENV` says.
 */
import { afterEach, beforeAll, expect, test } from 'bun:test';
import type { Alxia } from '@alxia/core';
import { createServer } from '@alxia/react-router';
import type { ServerBuild } from 'react-router';
import { fixtureBuild } from '../test/fixture';

let build: ServerBuild;
beforeAll(async () => {
	build = await fixtureBuild();
}, 60_000);

const before = process.env['NODE_ENV'];
afterEach(() => {
	if (before === undefined) delete process.env['NODE_ENV'];
	else process.env['NODE_ENV'] = before;
});

const boom = (app: Alxia) =>
	app.get('/api/boom', () => {
		throw new Error('boom');
	});

test("a production build's app is not in dev under NODE_ENV=development", async () => {
	process.env['NODE_ENV'] = 'development';
	const app = createServer({ configure: boom }).create({
		build,
		mode: 'production',
	});
	const response = await app.request('/api/boom');
	expect(response.status).toBe(500);
	expect(await response.json()).not.toHaveProperty('stack');
});

test("React Router's dev mode puts the app in dev", async () => {
	process.env['NODE_ENV'] = 'test';
	const app = createServer({ configure: boom }).create({
		build,
		mode: 'development',
	});
	const response = await app.request('/api/boom');
	expect(response.status).toBe(500);
	expect(await response.json()).toHaveProperty('stack');
});
