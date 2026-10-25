import { useSyncExternalStore } from 'react';
import {
	createUpdateNotice,
	sessionStore,
	type UpdateNotice,
	type UpdateNoticeStore,
} from '../model/update-notice';

/**
 * The page's one notice, which `useServiceWorker` offers and
 * `useUpdateNotice` reads. It lives here, not in `/pwa`, so that the model a
 * worker bundle imports makes nothing at load.
 */
export const updateNotice: UpdateNoticeStore = createUpdateNotice(sessionStore);

/**
 * The update notice to show: a new version waits and "Later" was not asked.
 * None on the server. `notice` is the page's `updateNotice` unless the app
 * made a store of its own.
 */
export function useUpdateNotice(
	notice: UpdateNoticeStore = updateNotice,
): UpdateNotice | undefined {
	return useSyncExternalStore(
		(listener) => notice.subscribe(listener),
		() => notice.current(),
		() => undefined,
	);
}
