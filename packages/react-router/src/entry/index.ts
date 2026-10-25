/**
 * `@alxia/react-router/entry`: `entry.server.tsx` for a React Router app on
 * Bun. Server only. It imports `react`, `react-dom/server`, `react-router`
 * and `isbot`, all optional peers but `react-router`.
 */
export {
	createEntry,
	type EntryOptions,
	type HandleRequest,
	handleRequest,
	streamTimeout,
} from './create-entry';
