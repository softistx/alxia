import { SERVICE_WORKER_URL, SKIP_WAITING } from './worker-contract';

/** What the registration reads of `navigator.serviceWorker`. */
export type ServiceWorkerContainerLike = Pick<
	ServiceWorkerContainer,
	'controller' | 'addEventListener' | 'register'
>;

/**
 * Calls `onWaiting` with each new version that finished installing while an
 * older one controls the page: the one waiting now, and each found later.
 * A first install controls nothing yet, so it offers nothing.
 */
export function watchForUpdates(
	registration: ServiceWorkerRegistration,
	container: Pick<ServiceWorkerContainerLike, 'controller'>,
	onWaiting: (worker: ServiceWorker) => void,
): void {
	const offer = (worker: ServiceWorker | null) => {
		if (worker && container.controller) onWaiting(worker);
	};
	offer(registration.waiting);
	registration.addEventListener('updatefound', () => {
		const installing = registration.installing;
		installing?.addEventListener('statechange', () => {
			if (installing.state === 'installed') offer(installing);
		});
	});
}

/** Moves this page onto a waiting worker: `apply(worker)`. */
export type ApplyUpdate = (
	worker: Pick<ServiceWorker, 'postMessage' | 'state'>,
) => void;

/**
 * The one update path of a page, created once: `apply(worker)` activates
 * the waiting worker and reloads once, when it takes control, so the page
 * runs the version its assets came from.
 *
 * - Several tabs: another tab may have activated the worker already. Its
 *   `controllerchange` reached this page before anyone asked, so this page
 *   did not reload (a form may be half filled); its "Reload" then reloads
 *   at once, the worker being active.
 * - Clicked twice, or a `controllerchange` after a direct reload: one
 *   reload, never two.
 */
export function createUpdater(
	container: Pick<
		ServiceWorkerContainerLike,
		'controller' | 'addEventListener'
	>,
	reload: () => void = () => window.location.reload(),
): ApplyUpdate {
	let requested = false;
	let reloaded = false;
	const reloadOnce = () => {
		if (reloaded) return;
		reloaded = true;
		reload();
	};
	container.addEventListener('controllerchange', () => {
		if (requested) reloadOnce();
	});
	return (worker) => {
		const active =
			worker.state === 'activating' ||
			worker.state === 'activated' ||
			container.controller === worker;
		if (active) return reloadOnce();
		requested = true;
		worker.postMessage({ type: SKIP_WAITING });
	};
}

/** Runs `run` once the page has loaded: registering never competes with it. */
export function afterLoad(run: () => void): void {
	if (document.readyState === 'complete') run();
	else window.addEventListener('load', run, { once: true });
}

export interface RegisterOptions {
	/** The worker's path. `SERVICE_WORKER_URL` by default. */
	url?: string;
	/** The scope it controls. `'/'` by default. */
	scope?: string;
}

let updater: ApplyUpdate | undefined;

/**
 * Registers the worker and watches for updates, handing each waiting worker
 * to `onWaiting` with the page's one `apply` (`createUpdater`, made on the
 * first call: one per page). A tab coming back to the foreground checks for
 * an update, as a long-lived page otherwise would only on its next full load.
 */
export async function registerServiceWorker(
	container: ServiceWorkerContainerLike,
	onWaiting: (worker: ServiceWorker, apply: ApplyUpdate) => void,
	options: RegisterOptions = {},
): Promise<ServiceWorkerRegistration> {
	updater ??= createUpdater(container);
	const apply = updater;
	const registration = await container.register(
		options.url ?? SERVICE_WORKER_URL,
		{ scope: options.scope ?? '/' },
	);
	watchForUpdates(registration, container, (worker) =>
		onWaiting(worker, apply),
	);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible')
			registration.update().catch(() => {
				// Offline, or the server is down: the next check will tell.
			});
	});
	return registration;
}
