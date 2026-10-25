/** The picked language and who listens to it: internal to `createPageLanguage`. */
export interface LanguageStore<L extends string> {
	subscribe(listener: () => void): () => void;
	getSnapshot(): L | undefined;
	choose(language: L): void;
}

export function createLanguageStore<L extends string>(): LanguageStore<L> {
	const listeners = new Set<() => void>();
	let chosen: L | undefined;
	return {
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getSnapshot: () => chosen,
		choose(language) {
			chosen = language;
			for (const listener of listeners) listener();
		},
	};
}
