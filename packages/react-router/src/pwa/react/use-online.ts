import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
	window.addEventListener('online', onChange);
	window.addEventListener('offline', onChange);
	return () => {
		window.removeEventListener('online', onChange);
		window.removeEventListener('offline', onChange);
	};
}

/**
 * Whether the browser says it is online. Online on the server and during
 * hydration, so the first client render matches the server's.
 */
export function useOnline(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => navigator.onLine,
		() => true,
	);
}
