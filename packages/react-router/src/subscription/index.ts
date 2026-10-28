/**
 * `@alxia/react-router/subscription`: a GraphQL subscription over SSE for a
 * BFF, as a resource route. It imports nothing (web APIs only), so it adds no
 * peer.
 */
export {
	createSubscriptionProxy,
	type SubscriptionProxy,
	type SubscriptionProxyOptions,
} from './proxy';
