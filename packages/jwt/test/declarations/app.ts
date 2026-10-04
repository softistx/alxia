// An app behind the guard, behind exported functions whose return types are
// inferred: a declaration build must be able to name each one through
// `@alxia/jwt` and `@alxia/core` alone (TS2883 otherwise).
import { alxia, type StandardSchemaV1 } from '@alxia/core';
import { bearer, createJwt } from '@alxia/jwt';

const Claims: StandardSchemaV1<
	unknown,
	{ sub: string; role: 'admin' | 'user' }
> = {
	'~standard': {
		version: 1,
		vendor: 'x',
		validate: (value) => ({
			value: value as { sub: string; role: 'admin' | 'user' },
		}),
	},
};

const jwt = createJwt({ secret: 'a secret of at least thirty-two bytes!' });

export function guarded() {
	return alxia()
		.plugin(bearer({ jwt, schema: Claims, cookie: 'session' }))
		.get('/me', ({ user, reply }) => reply(200, user.role));
}

export function guardedByClaims() {
	return alxia()
		.plugin(bearer({ jwt }))
		.get('/me', ({ user, reply }) => reply(200, user.sub ?? ''));
}

export function guardedBy<S extends StandardSchemaV1>(schema: S) {
	return alxia()
		.plugin(bearer({ jwt, schema }))
		.get('/me', ({ user, reply }) => reply(200, { user }));
}

export function guard() {
	return bearer({ jwt, schema: Claims });
}
