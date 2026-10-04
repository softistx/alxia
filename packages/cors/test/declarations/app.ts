// An app behind CORS, behind exported functions whose return types are
// inferred: a declaration build must be able to name each one through
// `@alxia/cors` and `@alxia/core` alone (TS2883 otherwise).
import { alxia } from '@alxia/core';
import { type CorsOrigin, cors } from '@alxia/cors';

export function shared() {
	return alxia()
		.use(cors({ origin: ['https://app.example.com', /\.example\.com$/] }))
		.get('/', ({ reply }) => reply(200, 'ok'));
}

export function sharedWith(origin: CorsOrigin) {
	return alxia()
		.use(cors({ origin, credentials: true, maxAge: 600 }))
		.post('/orders', ({ reply }) => reply(201, { id: 'o1' }));
}

export function policy() {
	return cors({ origin: (origin) => origin.endsWith('.example.com') });
}
