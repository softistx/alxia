// An app behind the secure headers, behind exported functions whose return
// types are inferred: a declaration build must be able to name each one
// through `@alxia/secure-headers` and `@alxia/core` alone (TS2883 otherwise).
import { alxia } from '@alxia/core';
import { NONCE, secureHeaders } from '@alxia/secure-headers';

export function secured() {
	return alxia()
		.use(secureHeaders({ referrerPolicy: 'same-origin' }))
		.get('/', ({ reply }) => reply(200, 'ok'));
}

export function withNonce() {
	return alxia()
		.use(
			secureHeaders({
				nonce: true,
				contentSecurityPolicy: `script-src 'self'; style-src 'self' ${NONCE}`,
			}),
		)
		.get('/', ({ nonce, reply }) => reply(200, { nonce }));
}

export function noncePlugin() {
	return secureHeaders({
		nonce: true,
		contentSecurityPolicy: "script-src 'self'",
	});
}

export function plainPlugin() {
	return secureHeaders();
}
