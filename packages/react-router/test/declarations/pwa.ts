// The /pwa model behind exported values whose types are inferred: a
// declaration build must be able to name each one through
// `@alxia/react-router/pwa` alone (TS2883 otherwise).
import {
	type BrowserManifest,
	cachingFor,
	defineWorkerContract,
	precacheList,
	type RequestFacts,
} from '@alxia/react-router/pwa';

export const contract = defineWorkerContract({ cachePrefix: 'app' });

export function caching(r: RequestFacts) {
	return cachingFor(r, 'https://a.test', {
		never: (p) => p.startsWith('/x/'),
	});
}

export function list(m: BrowserManifest) {
	return precacheList(m);
}
