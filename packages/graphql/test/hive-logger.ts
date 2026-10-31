import { Logger } from '@graphql-hive/logger';

/**
 * A `logging` value that records what is written by level. A hive `Logger`
 * serves both majors: Yoga 6 requires one (it calls `child` on it), and
 * Yoga 5 only calls its `debug`, `info`, `warn` and `error`.
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
