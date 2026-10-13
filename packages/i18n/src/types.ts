import type { BaseContext, Empty, Middleware, Next } from '@alxia/core';
import type { LanguageContext, LanguageOptions } from '@alxia/language';
import type { TranslationContext } from '@nxgt/i18n';

/** Catalogues by language: `{ en: { greeting: 'Hello {name}' }, fr: … }`. */
export type Catalogues = Readonly<
	Record<string, Readonly<Record<string, unknown>>>
>;

/**
 * Every key of a catalogue, dotted: `users.greeting`. The keys of
 * `@nxgt/i18n`'s `Path`, nine levels deep: a section nested deeper gives
 * `${section}.${string}`, any key under it.
 *
 * `Path` recurses without a bound. A catalogue that is a type parameter —
 * a function generic over the catalogues it hands to `createI18n` — leaves
 * it deferred, and some checks then unfold it forever (TS2589, "Type
 * instantiation is excessively deep and possibly infinite"). The depth
 * stops them.
 */
export type KeyOf<Catalogue> = KeysOf<Catalogue, 8> & string;

/** One level shallower: `Shallower[8]` is `7`, and `Shallower[0]` is `never`. */
type Shallower = [never, 0, 1, 2, 3, 4, 5, 6, 7];

/**
 * The dotted keys of `T`, `Depth` more levels down at most. `Path`'s own
 * test, `Record<string, any>`, kept so that the keys stay `Path`'s.
 */
type KeysOf<
	T,
	Depth extends number,
	K extends keyof T = keyof T,
> = K extends string
	? T[K] extends Record<string, any>
		? [Shallower[Depth]] extends [never]
			? `${K}.${string}`
			: `${K}.${KeysOf<T[K], Shallower[Depth]>}`
		: K
	: never;

/** A translation of a key, in a language, formatted with ICU's `context`. */
export type Translate<Key extends string> = (
	key: Key,
	context?: TranslationContext,
) => string;

/** What both forms of `createI18n()` take beside their catalogues. */
interface CommonOptions<Language extends string, Ctx extends object>
	extends Omit<LanguageOptions<Language, Ctx>, 'supported' | 'fallback'> {
	/**
	 * The languages to try after the request's own, before `fallback`:
	 * `(language) => ['fr']`, or the closest ones, `pt-BR` then `pt`. A key
	 * missing in a catalogue is looked up in each, in order; it answers
	 * itself only when every one misses. Default: none.
	 */
	readonly fallbacks?: (language: Language) => readonly string[];
}

/**
 * `Ctx` is the type `resolve`'s parameter is annotated with —
 * `BaseContext & { user: User }`, or `{ user: User }` alone — and
 * `BaseContext` when it is not: what the plugin then requires of the app.
 */
export interface I18nOptions<
	C extends Catalogues,
	Fallback extends keyof C & string,
	Ctx extends object = BaseContext,
> extends CommonOptions<keyof C & string, Ctx> {
	/**
	 * The catalogues, one per language: their keys are the languages
	 * supported. Spread `@nxgt/i18n`'s `resources` into them for its shared
	 * keys — `errors.not-found`, `zod.*`.
	 */
	readonly resources: C;
	/** The language spoken when the request names none, and whose keys type `t`. */
	readonly fallback: Fallback;
}

/**
 * The options of `createI18n<Key>()`: the keys are the explicit `Key`, the
 * catalogues may come later, from `setResources()`.
 */
export interface RuntimeI18nOptions<
	Language extends string = string,
	Ctx extends object = BaseContext,
> extends CommonOptions<Language, Ctx> {
	/**
	 * The languages supported until `setResources()` gives catalogues; then
	 * the catalogues' own. Default: those of `resources`, else `[fallback]`.
	 */
	readonly languages?: readonly Language[];
	/** The catalogues, when known now; else give them to `setResources()`. */
	readonly resources?: Catalogues;
	/** The language spoken when the request names none. */
	readonly fallback: Language;
}

/** What the routes behind the plugin read. */
export interface I18nContext<Key extends string> {
	/** Translates into the request's language. */
	readonly t: Translate<Key>;
}

/**
 * What `createI18n()` makes: a middleware that gives `language`, one of
 * `Language`, and `t`, typed by `Key`, and requires `Requires` of the app —
 * what `resolve` reads — with a `t` and a `language` of its own for the
 * request running.
 */
export type I18nMiddleware<
	Language extends string,
	Key extends string,
	Requires extends object = Empty,
> = Middleware<
	Requires,
	Promise<Next<LanguageContext<Language> & I18nContext<Key>>>
> & {
	/** Translates into the current request's language, or the fallback outside one. */
	t: Translate<Key>;
	/** The current request's language, or the fallback outside one. */
	language: () => Language;
	/** The languages of the catalogues: the same array, updated in place by `setResources()`. */
	supported: Language[];
	/**
	 * Adds a step to the current request's chain, after its language and
	 * before `fallbacks`: the school's language, once the app knows it. A
	 * no-op outside a request.
	 */
	fallBackTo: (language: string) => void;
	/**
	 * The languages `t()` tries, in order and each once: the request's, the
	 * `fallBackTo` steps, `fallbacks(language)`, then `fallback`. For data
	 * the app labels itself. Until `fallbacks` is given or `fallBackTo` is
	 * called, `t()` reads the request's language alone; the list is the same.
	 */
	chain: () => string[];
	/**
	 * Swaps the catalogues, all at once, and `supported` follows. A request
	 * running keeps the ones it started with. Throws, changing nothing, when
	 * there is none for the fallback.
	 */
	setResources: (
		resources: Readonly<Record<Language, Readonly<Record<string, unknown>>>>,
	) => void;
};
