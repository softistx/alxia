/**
 * The part of the service worker's global scope that `startWorker` reads,
 * declared here so no WebWorker-only type reaches the package's declarations
 * (the DOM lib has no `ServiceWorkerGlobalScope`).
 */
export interface WorkerScope {
	readonly location: { readonly origin: string };
	skipWaiting(): Promise<void>;
	addEventListener(
		type: 'activate' | 'message',
		listener: (event: {
			data?: unknown;
			waitUntil(promise: Promise<unknown>): void;
		}) => void,
	): void;
}

/** The worker's scope. Called only inside `startWorker`, never at module load. */
export const workerScope = (): WorkerScope =>
	globalThis as unknown as WorkerScope;
