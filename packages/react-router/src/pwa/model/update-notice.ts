/**
 * The session's "Later": the notice stays hidden until the next visit.
 * `sessionStorage` is per origin, so one key serves every app; a second
 * argument of `createUpdateNotice` names another.
 */
export const UPDATE_LATER_KEY = 'alxia.update-later';

/** The part of `Storage` the notice reads and writes. */
export type NoticeStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** What the notice offers while a new version waits. */
export type UpdateNotice = {
	/** Moves the page onto the new version: the worker's `apply`. */
	reload: () => void;
	/** Hides the notice until the next visit (the tab's session). */
	later: () => void;
};

/** What `createUpdateNotice` returns: the shape `useSyncExternalStore` takes. */
export interface UpdateNoticeStore {
	/** A new version waits: `apply` moves the page onto it. */
	offer(apply: () => void): void;
	/** The notice to show, if any (the same object until it changes). */
	current(): UpdateNotice | undefined;
	/** Calls `listener` on each change; returns the function that stops it. */
	subscribe(listener: () => void): () => void;
}

/**
 * The update notice's state: offered by the worker's registration, read by
 * the banners, hidden for the session by "Later". `storage` is the session's
 * (`sessionStorage`), which may be missing or throw (private mode, blocked
 * storage): the notice then hides for this page only. It is a function so
 * that nothing reads the global at load.
 */
export function createUpdateNotice(
	storage: () => NoticeStorage | undefined,
	key: string = UPDATE_LATER_KEY,
): UpdateNoticeStore {
	let reload: (() => void) | undefined;
	let laterThisPage = false;
	let notice: UpdateNotice | undefined;
	const listeners = new Set<() => void>();

	const later = () => {
		laterThisPage = true;
		try {
			storage()?.setItem(key, '1');
		} catch {
			// No storage: hidden for this page only.
		}
		refresh();
	};
	const laterAsked = () => {
		if (laterThisPage) return true;
		try {
			return storage()?.getItem(key) === '1';
		} catch {
			return false;
		}
	};
	function refresh() {
		notice = reload && !laterAsked() ? { reload, later } : undefined;
		for (const listener of listeners) listener();
	}

	return {
		offer(apply) {
			reload = apply;
			refresh();
		},
		current: () => notice,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

/** `sessionStorage`, or nothing where there is none (the server). */
export const sessionStore = (): NoticeStorage | undefined =>
	typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
