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
		.use(bearer({ jwt, schema: Claims, cookie: 'session' }))
		.get('/me', ({ user, reply }) => reply(200, user.role));
}

export function guardedByClaims() {
	return alxia()
		.use(bearer({ jwt }))
		.get('/me', ({ user, reply }) => reply(200, user.sub ?? ''));
}

export function guardedBy<S extends StandardSchemaV1>(schema: S) {
	return alxia()
		.use(bearer({ jwt, schema }))
		.get('/me', ({ user, reply }) => reply(200, { user }));
}

export function guard() {
	return bearer({ jwt, schema: Claims });
}

const idp = createJwt({ discovery: 'https://idp.example.com/realms/acme' });

export function guardedByIdp() {
	return alxia()
		.use(bearer({ jwt: idp, schema: Claims }))
		.get('/me', ({ user, reply }) => reply(200, user.role));
}

// Refused by the types: both sources, and an algorithm a key set cannot verify.
// @ts-expect-error jwks or discovery, not both
createJwt({ jwks: 'https://a.example/jwks', discovery: 'https://a.example' });
// @ts-expect-error HS256 is never verified by a key set
createJwt({ jwks: 'https://a.example/jwks', algorithms: ['HS256'] });
// @ts-expect-error a verifier by key set cannot sign
idp.sign({});
