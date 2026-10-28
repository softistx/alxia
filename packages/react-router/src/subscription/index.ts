/**
 * `@alxia/react-router/subscription`: GraphQL subscriptions over SSE for a
 * BFF, as a resource route. It imports `react-router` (through `/errors`'
 * same-site check) and nothing else, so it adds no peer.
 */
export {
	createSubscriptionProxy,
	type SubscriptionProxy,
	type SubscriptionProxyOptions,
} from './proxy';
