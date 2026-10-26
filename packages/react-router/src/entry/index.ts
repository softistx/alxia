/**
 * `@alxia/react-router/entry`: `entry.server.tsx` for a React Router app on
 * Bun. Server only. It imports `react`, `react-dom/server`, `react-router`
 * and, only when no `isBot` option is given, `isbot`: all optional peers but
 * `react-router`.
 */
export {
	createEntry,
	type Entry,
	type EntryOptions,
	type HandleRequest,
	handleRequest,
	streamTimeout,
} from './create-entry';
