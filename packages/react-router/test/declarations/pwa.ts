// The /pwa model behind exported values whose types are inferred: a
// declaration build must be able to name each one through
// `@alxia/react-router/pwa` alone (TS2883 otherwise).
import {
	type BrowserManifest,
	cachingFor,
	createUpdateNotice,
	defineWorkerContract,
	precacheList,
	type RequestFacts,
	sessionStore,
	webAppManifest,
} from '@alxia/react-router/pwa';
import {
	updateNotice,
	useOnline,
	useServiceWorker,
	useUpdateNotice,
} from '@alxia/react-router/pwa/react';

export const contract = defineWorkerContract({ cachePrefix: 'app' });

export function caching(r: RequestFacts) {
	return cachingFor(r, 'https://a.test', {
		never: (p) => p.startsWith('/x/'),
	});
}

export function list(m: BrowserManifest) {
	return precacheList(m);
}

export const notice = createUpdateNotice(sessionStore);

export function manifest() {
	return webAppManifest({
		name: 'Demo',
		description: 'A demo app',
		lang: 'en',
		themeColor: '#112233',
		backgroundColor: '#ffffff',
	});
}

// The /pwa/react hooks behind exported values whose types are inferred.
export function online() {
	return useOnline();
}

export function register() {
	useServiceWorker({ enabled: true, url: '/sw.js', notice: updateNotice });
}

export function banner() {
	return useUpdateNotice(notice);
}
