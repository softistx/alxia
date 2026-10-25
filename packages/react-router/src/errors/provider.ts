import type { ReactNode } from 'react';
import type { ApiMessages, CatalogueMessages } from './messages';

export interface ApiMessagesProviderProps<L extends string> {
	/** The store `apiCodeResolver` reads. */
	messages: ApiMessages<L>;
	/** The messages the root's data carries, by language. */
	value: Readonly<Record<L, CatalogueMessages>> | undefined;
	children: ReactNode;
}

/**
 * Fills the browser's catalogue with the messages the root's data carries
 * (the few its forms word), before the children render: `apiCodeResolver`
 * reads them synchronously. A server render writes nothing: the server's
 * store holds the whole, fresher catalogue, and a render's data may be older
 * than it. It is a plain function (no JSX, no React runtime): use it as
 * `ApiMessagesProvider({ messages, value, children })` from a component, or
 * as an element's type.
 */
export function ApiMessagesProvider<L extends string>({
	messages,
	value,
	children,
}: ApiMessagesProviderProps<L>): ReactNode {
	const inBrowser =
		typeof (globalThis as { document?: unknown }).document !== 'undefined';
	if (value && inBrowser) {
		for (const [language, held] of Object.entries<CatalogueMessages>(value)) {
			messages.add(language as L, held);
		}
	}
	return children;
}
