import { expect, test } from 'bun:test';
import { client } from '@alxia/client';
import { apiKey, app } from './app';

const json = { 'content-type': 'application/json', 'x-api-key': apiKey };

test('creates a todo from JSON', async () => {
	const response = await app.request('/todos', {
		method: 'POST',
		headers: json,
		body: JSON.stringify({ title: 'Write a route' }),
	});
	expect(response.status).toBe(201);
	expect(await response.json()).toEqual({
		id: expect.any(Number),
		title: 'Write a route',
		done: false,
	});
});

test('refuses an empty title with a 400 naming it', async () => {
	const response = await app.request('/todos', {
		method: 'POST',
		headers: json,
		body: JSON.stringify({ title: '' }),
	});
	expect(response.status).toBe(400);
	expect((await response.json()).issues[0].path).toEqual(['title']);
});

test('the typed client reads each status the route answers', async () => {
	// Given the app itself, the client calls its fetch in process.
	const api = client(app, { headers: { 'x-api-key': apiKey } });
	const created = await api.post('/todos', {
		body: { title: 'Call it typed' },
	});
	if (created.status !== 201) throw new Error(`got ${created.status}`);
	expect(created.data.title).toBe('Call it typed'); // data is the Todo schema's type

	const anonymous = await client(app).post('/todos', {
		body: { title: 'No key' },
	});
	expect(anonymous.status).toBe(401);
	if (anonymous.status === 401)
		expect(anonymous.data.error).toBe('unauthorized');
});
