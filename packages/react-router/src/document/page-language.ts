import { useSyncExternalStore } from 'react';

export interface PageLanguageOptions<L extends string> {
	/** The languages the app serves. */
	readonly languages: readonly L[];
	/** The language of a page whose root data gives none; one of `languages`. */
	readonly fallback: NoInfer<L>;
	/** Whether this is a browser. Default: `typeof document !== 'undefined'`. */
	readonly browser?: () => boolean;
}

export interface PageLanguage<L extends string> {
	/**
	 * The page's language from the root loader's `language`. In the browser,
	 * the one picked with `chooseLanguage` wins, and the last one seen stands
	 * in when the root's data is gone (a failed navigation takes the root's
	 * with it): the error page keeps the page's language, not the fallback's.
	 * On the server it remembers nothing, since one module serves every request.
	 */
	pageLanguage(language: string | undefined): L;
	/** The page's language in a route's `meta`, from `matches[0].loaderData.language`. */
	metaLanguage(matches: ReadonlyArray<unknown>): L;
	/**
	 * Records the language picked in a language menu: from then on the page's
	 * language in the browser, until the next document. Re-renders every
	 * `useChosenLanguage()`.
	 */
	chooseLanguage(language: L): void;
	/** The language picked in this document, if any; re-renders on a new pick. */
	useChosenLanguage(): L | undefined;
}

/**
 * The page's language for a root route: `<html lang>`, a route's `meta`, and
 * the language menu. An instance, not module state: keep one per app, in a
 * module both the root and the routes import.
 */
export function createPageLanguage<const L extends string>(
	options: PageLanguageOptions<L>,
): PageLanguage<L> {
	const { languages, fallback } = options;
	if (!languages.includes(fallback)) {
		throw new TypeError(
			`createPageLanguage(): the fallback "${fallback}" is not one of the languages.`,
		);
	}
	const isBrowser = options.browser ?? (() => typeof document !== 'undefined');
	const listeners = new Set<() => void>();
	let last: L | undefined;
	let chosen: L | undefined;

	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};

	function pageLanguage(language: string | undefined): L {
		const supported = languages.find((known) => known === language);
		if (!isBrowser()) return supported ?? fallback;
		const current = chosen ?? supported;
		if (current) last = current;
		return last ?? fallback;
	}

	return {
		pageLanguage,
		metaLanguage(matches) {
			const root = matches[0] as
				| { loaderData?: { language?: string } }
				| undefined;
			return pageLanguage(root?.loaderData?.language);
		},
		chooseLanguage(language) {
			chosen = language;
			for (const listener of listeners) listener();
		},
		useChosenLanguage: () =>
			useSyncExternalStore(
				subscribe,
				() => chosen,
				() => undefined,
			),
	};
}
