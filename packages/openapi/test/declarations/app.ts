// An app serving its own document, behind exported functions whose return
// types are inferred: a declaration build must be able to name each one
// through `@alxia/openapi` and `@alxia/core` alone (TS2883 otherwise).
import { alxia } from '@alxia/core';
import { docs } from '@alxia/openapi';

const api = alxia().get('/users', ({ reply }) => reply(200, ['ada']));

export function documented() {
	return api.use(
		docs(api, {
			info: { title: 'Users', version: '1.0.0' },
			path: '/spec.json',
			ui: false,
		}),
	);
}

export function documentedWithUi() {
	return api.use(docs(api, { info: { title: 'Users', version: '1.0.0' } }));
}
