/**
 * `@alxia/react-router/pwa`: the code with no UI an installable app shares.
 * No import at all, so the page, the service worker, a build script and the
 * server can each import it.
 */
export {
	type Caching,
	type CachingOptions,
	cachingFor,
	type RequestFacts,
} from './model/caching';
export { clearAppCaches } from './model/clear-app-caches';
export {
	MANIFEST_HEADERS,
	MANIFEST_PATH,
	type ManifestIcon,
	MINIMAL_2023_ICONS,
	manifestHref,
	manifestLanguage,
	type WebAppManifest,
	type WebAppManifestOptions,
	webAppManifest,
} from './model/manifest';
export {
	assetPrecache,
	type BrowserManifest,
	type PrecacheEntry,
	parseBrowserManifest,
	precacheList,
} from './model/precache-list';
export {
	type ApplyUpdate,
	afterLoad,
	createUpdater,
	type RegisterOptions,
	registerServiceWorker,
	type ServiceWorkerContainerLike,
	watchForUpdates,
} from './model/registration';
export { isStorable } from './model/storable';
export {
	createUpdateNotice,
	type NoticeStorage,
	sessionStore,
	UPDATE_LATER_KEY,
	type UpdateNotice,
	type UpdateNoticeStore,
} from './model/update-notice';
export {
	type CacheNames,
	defineWorkerContract,
	OFFLINE_URL,
	SERVICE_WORKER_URL,
	SKIP_WAITING,
	type WorkerContract,
	type WorkerContractOptions,
} from './model/worker-contract';
