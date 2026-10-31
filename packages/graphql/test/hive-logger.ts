import { Logger } from '@graphql-hive/logger';

/**
 * A Yoga 6 `logging` value that records what is written by level. Yoga 6
 * takes a `@graphql-hive/logger` `Logger` (it calls `child` on it), no longer
 * a bare `{ debug, info, warn, error }` object.
 */
export function spyLogger() {
	const calls: Record<string, unknown[][]> = {
		debug: [],
		info: [],
		warn: [],
		error: [],
		trace: [],
	};
	const logger = new Logger({
		level: 'trace',
		writers: [
			{
				write(level, attrs, msg) {
					calls[level]?.push([msg, attrs]);
				},
			},
		],
	});
	return { logger, calls };
}
