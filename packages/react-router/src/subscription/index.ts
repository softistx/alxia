/**
 * `@alxia/react-router/subscription`: GraphQL subscriptions over SSE for a
 * BFF, as a resource route. It imports nothing (web APIs only), so it adds
 * no peer.
 */
export {
	createSubscriptionProxy,
	type SubscriptionProxy,
	type SubscriptionProxyOptions,
} from './proxy';
