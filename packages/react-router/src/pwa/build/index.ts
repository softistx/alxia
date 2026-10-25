/**
 * `@alxia/react-router/pwa/build`: bundles the service worker into the
 * client build with its precache list. Run it on Bun, after
 * `react-router build`. Node's built-ins are its only imports, and Bun's
 * global is read inside the function, never at load.
 */

export type { BuildWorkerOptions, WorkerBuild } from './build-worker';
export { buildWorker } from './build-worker';
