export {
	handleRequest as default,
	streamTimeout,
} from '@alxia/react-router/entry';

/** The specs provoke a 404 and a 500 on purpose: React Router would print each one. */
export function handleError() {}
