// An app behind the logger, behind exported functions whose return types are
// inferred: a declaration build must be able to name each one through
// `@alxia/logger` and `@alxia/core` alone (TS2883 otherwise).
import { alxia } from '@alxia/core';
import { logger } from '@alxia/logger';

export function logged() {
	return alxia()
		.use(
			logger({
				header: 'x-trace-id',
				skip: (_request, url) => url.pathname === '/health',
			}),
		)
		.get('/', ({ log, requestId, reply }) => {
			log.info('home', { requestId });
			return reply(200, requestId);
		});
}

export function logging() {
	return logger();
}
