/**
 * `@alxia/react-router/pwa/worker`: the service worker on Workbox. Import it
 * from a service worker bundle alone, never from a page. The six `workbox-*`
 * packages (`core`, `expiration`, `navigation-preload`, `precaching`,
 * `routing`, `strategies`, optional peers) are its only package imports.
 */

export type { ExpirationOptions, WorkerOptions } from './plan';
export { startWorker } from './start-worker';
