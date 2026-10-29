/**
 * `@alxia/react-router/fetcher`: the hooks around a React Router fetcher's
 * answers. `react` and `react-router` are its imports, and every hook renders
 * on the server (a load starts in the browser only).
 */

export {
	type DebouncedFetcher,
	type DebouncedFetcherOptions,
	type DebouncedFetcherState,
	useDebouncedFetcher,
} from './use-debounced-fetcher';
export { type AnswerSource, useFetcherAnswer } from './use-fetcher-answer';
