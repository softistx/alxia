import type { WorkerContract } from './worker-contract';

/**
 * Deletes every cache the service worker filled, but the offline page.
 * For sign-out: what the caches hold is static and public by design, and
 * clearing them leaves nothing behind anyway. Safe where Cache Storage does
 * not exist (server, old browsers).
 */
export async function clearAppCaches(
	contract: Pick<WorkerContract, 'clearableCaches'>,
): Promise<void> {
	if (typeof caches === 'undefined') return;
	const names = contract.clearableCaches(await caches.keys());
	await Promise.all(names.map((name) => caches.delete(name)));
}
