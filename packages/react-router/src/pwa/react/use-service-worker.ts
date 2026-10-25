import { useEffect, useRef } from 'react';
import { startServiceWorker } from '../model/start-service-worker';
import type { UpdateNoticeStore } from '../model/update-notice';
import { updateNotice } from './use-update-notice';

export interface ServiceWorkerOptions {
	/**
	 * Whether to register at all. The app decides, typically
	 * `import.meta.env.PROD`: a worker under a dev server caches the code being
	 * edited. This package never reads `import.meta.env` itself.
	 */
	enabled: boolean;
	/** The worker's path. `SERVICE_WORKER_URL` by default. */
	url?: string;
	/** The scope it controls. `'/'` by default. */
	scope?: string;
	/** Where a waiting version is offered. The page's `updateNotice` by default. */
	notice?: UpdateNoticeStore;
	/**
	 * Called when registering fails (private mode, a blocked script). The app
	 * works without a worker, so by default the error is dropped. An `onError`
	 * that throws becomes an unhandled rejection.
	 */
	onError?: (error: unknown) => void;
}

/**
 * Registers the service worker after `load` when `enabled`, in a browser
 * that has one. When a new version waits, `notice` offers it (`useUpdateNotice`
 * reads it); nothing activates it unasked. Does nothing on the server.
 *
 * The options are read when the effect runs, which is on mount and when
 * `enabled`, `url`, `scope` or `notice` change; `onError` is always the
 * latest. The listeners it adds (the update check, the controller change)
 * stay for the page's life: there is no cleanup, a page has one worker.
 */
export function useServiceWorker(options: ServiceWorkerOptions): void {
	const { enabled, url, scope, notice = updateNotice } = options;
	const onError = useRef(options.onError);
	useEffect(() => {
		onError.current = options.onError;
	});
	useEffect(() => {
		startServiceWorker(
			{ navigator },
			{
				enabled,
				notice,
				onError: (error) => onError.current?.(error),
				...(url !== undefined && { url }),
				...(scope !== undefined && { scope }),
			},
		);
	}, [enabled, url, scope, notice]);
}
