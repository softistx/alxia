// An app's typed client, behind exported values whose types are inferred: a
// declaration build must be able to name each one through `@alxia/client`
// and `@alxia/core` alone (TS2883 otherwise).
import { client } from '@alxia/client';
import { alxia, eventStream, type StandardSchemaV1 } from '@alxia/core';

function schema<T, Input = T>(): StandardSchemaV1<Input, T> {
	return {
		'~standard': {
			version: 1,
			vendor: 'x',
			validate: (value) => ({ value: value as T }),
		},
	};
}

const Ping = schema<{ interval: number }>();
const Push = eventStream({ ping: Ping });

const app = alxia()
	.get(
		'/users/:id',
		{
			params: schema<{ id: number }, { id: string }>(),
			response: { 200: schema<{ id: number; name: string }>() },
		},
		({ params, reply }) => reply(200, { id: params.id, name: 'Ada' }),
	)
	.post('/users', { body: schema<{ name: string }>() }, ({ body, reply }) =>
		reply(201, body),
	)
	.get('/push', { response: { 200: Push } }, ({ reply }) =>
		reply(
			200,
			(async function* () {
				yield Push.event('ping', { interval: 1 });
			})(),
		),
	)
	.ws(
		'/rooms/:room',
		{ message: Ping, send: Ping },
		{
			message: (socket, ping) => socket.send(ping),
		},
	);

export const api = client<typeof app>('http://localhost:3000');

export const inProcess = client(app, { headers: { 'x-tenant': 't' } });

export function user(id: number) {
	return api.get('/users/:id', { params: { id } });
}

export function created() {
	return api.post('/users', { body: { name: 'Ada' } });
}

export function pushed() {
	return api.get('/push');
}

export function room() {
	return api.ws('/rooms/:room', { params: { room: 'a' } });
}

export function clientOf<App extends typeof app>(target: App) {
	return client(target);
}
