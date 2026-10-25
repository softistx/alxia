/**
 * `@alxia/react-router/pwa/react`: the hooks of an installable app's page.
 * `react` is its only import (an optional peer of the package), and what it
 * shares with `/pwa` is a chunk of that entry.
 */
export { useOnline } from './use-online';
export {
	type ServiceWorkerOptions,
	useServiceWorker,
} from './use-service-worker';
export { updateNotice, useUpdateNotice } from './use-update-notice';
