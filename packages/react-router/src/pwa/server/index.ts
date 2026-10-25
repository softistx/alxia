/**
 * `@alxia/react-router/pwa/server`: the server's side of an installable
 * app, `noCache` for the worker's script. `@alxia/core` is its only import,
 * so keep it out of the page and the worker.
 */
export { noCache, revalidated, WORKER_POLICY } from './no-cache';
