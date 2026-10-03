import type { TypedSocket } from '../types';

/** What a socket sends with its upgrade: everything, and the call's own part of it. */
export interface UpgradeHeaders {
	readonly merged: Headers;
	readonly own: Headers;
}

/**
 * A typed socket over `WebSocket`: JSON both ways, sends queued until it
 * opens. Headers go with the upgrade under Bun, whose `WebSocket` takes
 * them. Elsewhere — a browser — a `WebSocket` cannot send any: the
 * client's own `headers` are left out, and the call's typed headers or
 * cookies are an error rather than an upgrade the server refuses.
 */
export function openSocket<Send, Receive>(
	url: URL,
	headers: UpgradeHeaders = { merged: new Headers(), own: new Headers() },
	isBun = typeof globalThis.Bun !== 'undefined',
): TypedSocket<Send, Receive> {
	const raw = connect(url, headers, isBun);
	const listeners = new Set<(message: Receive) => void>();
	const queue: string[] = [];
	const opened = new Promise<void>((resolve, reject) => {
		raw.addEventListener('open', () => {
			for (const message of queue.splice(0)) raw.send(message);
			resolve();
		});
		raw.addEventListener('error', () =>
			reject(new Error(`The socket to ${url} failed`)),
		);
	});
	opened.catch(() => {});
	raw.addEventListener('message', (event) => {
		const message = JSON.parse(String(event.data)) as Receive;
		for (const listener of listeners) listener(message);
	});
	return {
		raw,
		opened,
		send(message) {
			const text = JSON.stringify(message);
			if (raw.readyState === WebSocket.OPEN) raw.send(text);
			else queue.push(text);
		},
		on(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		close: (code, reason) => raw.close(code, reason),
		async *[Symbol.asyncIterator]() {
			const pending: Receive[] = [];
			let wake: (() => void) | undefined;
			let closed = raw.readyState === WebSocket.CLOSED;
			const off = this.on((message) => {
				pending.push(message);
				wake?.();
			});
			const onClose = () => {
				closed = true;
				wake?.();
			};
			raw.addEventListener('close', onClose);
			try {
				while (true) {
					const next = pending.shift();
					if (next !== undefined) {
						yield next;
						continue;
					}
					if (closed) return;
					await new Promise<void>((resolve) => {
						wake = resolve;
					});
					wake = undefined;
				}
			} finally {
				off();
				raw.removeEventListener('close', onClose);
			}
		},
	};
}

const isEmpty = (headers: Headers) => headers.keys().next().done === true;

function connect(url: URL, headers: UpgradeHeaders, isBun: boolean): WebSocket {
	if (!isBun) {
		if (!isEmpty(headers.own)) {
			throw new TypeError(
				`ws(${url.pathname}): outside Bun, a WebSocket cannot send headers or cookies; a browser sends its own cookies for the socket's host, and anything else goes in the query`,
			);
		}
		return new WebSocket(url);
	}
	if (isEmpty(headers.merged)) return new WebSocket(url);
	// Bun's `WebSocket` takes headers; the DOM type does not know it.
	return new WebSocket(url, {
		headers: headers.merged,
	} as unknown as string[]);
}
