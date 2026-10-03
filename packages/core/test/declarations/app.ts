// Every builder an app can be made of, behind exported functions whose
// return types are inferred: a declaration build must be able to name each
// one through `@alxia/core` alone (TS2883 otherwise).
import { alxia, eventStream, problem } from '@alxia/core';

const Ping = {
	'~standard': {
		version: 1,
		vendor: 'x',
		validate: (value: unknown) => ({ value: value as { interval: number } }),
	},
} as const;

export function refusing() {
	return alxia()
		.derive(() => ({ user: 'u' }))
		.group('/jmap', (group) =>
			group
				.bodyLimit(1024)
				.onRefusal((r) =>
					r.kind === 'body_limit'
						? problem({
								type: 'urn:ietf:params:jmap:error:limit',
								status: 413,
								limit: 'maxSizeRequest',
							})
						: problem({
								type: 'urn:ietf:params:jmap:error:notRequest',
								status: 404,
							}),
				)
				.post('/', { body: Ping }, ({ reply }) => reply(200, { ok: true })),
		);
}

export function refusingMaybe() {
	return alxia()
		.onRefusal((r) =>
			r.kind === 'validation'
				? problem({ status: 400, detail: r.part })
				: undefined,
		)
		.get('/:id', { params: Ping }, ({ reply }) => reply(200, 'x'));
}

export function refusingWithSchemas() {
	return alxia().onRefusal(
		{ response: { 400: Ping }, contentType: 'application/problem+json' },
		(_refusal, { reply }) => reply(400, { interval: 1 }),
	);
}

export function streaming() {
	const Push = eventStream({ ping: Ping });
	return alxia().get('/push', { response: { 200: Push } }, ({ reply }) =>
		reply(
			200,
			(async function* () {
				yield Push.event('ping', { interval: 1 });
			})(),
		),
	);
}
