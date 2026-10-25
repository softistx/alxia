import type { ServiceWorkerContainerLike } from './registration';
import { afterLoad, registerServiceWorker } from './registration';
import type { UpdateNoticeStore } from './update-notice';

/** What starting reads of the browser: `navigator`, which may have no worker. */
export interface ServiceWorkerEnvironment {
	navigator: object & { serviceWorker?: ServiceWorkerContainerLike };
}

export interface StartServiceWorkerOptions {
	enabled: boolean;
	url?: string;
	scope?: string;
	notice: Pick<UpdateNoticeStore, 'offer'>;
	onError?: (error: unknown) => void;
}

/**
 * The body of `useServiceWorker`'s effect, a plain function so that it is
 * tested without React: registers after `load` when `enabled` and the
 * browser has a worker container, offers each waiting version to `notice`,
 * and hands a failed registration to `onError`. The listeners it adds live
 * for the page.
 */
export function startServiceWorker(
	environment: ServiceWorkerEnvironment,
	options: StartServiceWorkerOptions,
): void {
	const { navigator } = environment;
	if (!options.enabled || !('serviceWorker' in navigator)) return;
	const container = navigator.serviceWorker;
	if (!container) return;
	const { url, scope, notice, onError } = options;
	afterLoad(() => {
		registerServiceWorker(
			container,
			(worker, apply) => notice.offer(() => apply(worker)),
			{
				...(url !== undefined && { url }),
				...(scope !== undefined && { scope }),
			},
		).catch((error: unknown) => onError?.(error));
	});
}
