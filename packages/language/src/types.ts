/** Where a language is read from. */
export type LanguageSource = 'query' | 'cookie' | 'path' | 'header';

/** What the routes behind the plugin read. */
export interface LanguageContext<L extends string> {
	readonly language: L;
	/** Where it came from: `fallback` when nothing named one. */
	readonly languageSource: LanguageSource | 'resolve' | 'fallback';
}
