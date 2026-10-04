import { AsyncLocalStorage } from 'node:async_hooks';
import { type BaseContext, definePlugin, type RequiresOf } from '@alxia/core';
import { type LanguageOptions, language } from '@alxia/language';
import {
	createTranslator,
	registerLanguageSource,
	type TranslationContext,
} from '@nxgt/i18n';

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

/**
 * `Ctx` is the type `resolve`'s parameter is annotated with —
 * `BaseContext & { user: User }`, or `{ user: User }` alone — and
 * `BaseContext` when it is not: what the plugin then requires of the app.
 */
export interface I18nOptions<
	C extends Catalogues,
	Fallback extends keyof C & string,
	Ctx extends object = BaseContext,
> extends Omit<
		LanguageOptions<keyof C & string, Ctx>,
		'supported' | 'fallback'
	> {
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
 * The request's language as `@nxgt/i18n` hears it: the first an i18n plugin
 * read, when an app uses several. Opened fresh by each plugin's `around`.
 */
const requests = new AsyncLocalStorage<{ language?: string }>();

/** `@nxgt/i18n`'s source: one function, so registering it again keeps one. */
const requestLanguage = () => requests.getStore()?.language;

/** What the routes behind the plugin read. */
export interface I18nContext<Key extends string> {
	/** Translates into the request's language. */
	readonly t: Translate<Key>;
}

/**
 * Translations, as a plugin, on [`@nxgt/i18n`](https://www.npmjs.com/package/@nxgt/i18n):
 * `@alxia/language` reads the request's language among the catalogues', and
 * the routes declared after it read `language` and `t`, bound to it. Keys
 * are typed by the fallback's catalogue; messages are ICU — plurals,
 * selects, numbers — and a missing key answers itself.
 *
 * The plugin's own `t()` translates anywhere a request runs — a service, an
 * error's message — in that request's language, and in the fallback outside.
 *
 * ```ts
 * const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });
 * app.use(i18n).get('/', ({ t, reply }) => reply(200, t('home.title')));
 * ```
 *
 * The plugin registers the request's language as one of `@nxgt/i18n`'s
 * language sources, so its own `getLanguage()` and `translate` — and every
 * nxgt package that translates through them — speak it too.
 */
export function createI18n<
	const C extends Catalogues,
	const Fallback extends keyof C & string,
	Ctx extends object = BaseContext,
>(options: I18nOptions<C, Fallback, Ctx>) {
	type Language = keyof C & string;
	type Key = KeyOf<C[Fallback]>;
	const { resources, fallback, resolve, ...detect } = options;
	const supported = Object.keys(resources) as Language[];
	const translator = createTranslator<Key>(
		resources as Record<string, unknown>,
	);
	/**
	 * This plugin's language for the request running, once `@alxia/language`
	 * has read it. A global `around` hook opens it fresh for each request —
	 * one made from inside another included — so it holds for everything the
	 * request runs, `onError` hooks too, which run after the route failed.
	 */
	const current = new AsyncLocalStorage<{ language?: Language }>();
	const spoken = (): Language => current.getStore()?.language ?? fallback;
	const translate =
		(lang: Language): Translate<Key> =>
		(key, context) =>
			translator(key, context, lang as never);

	// nxgt's own getLanguage() and translate speak the request's language too.
	registerLanguageSource(requestLanguage);

	// The plugin requires what `resolve` reads, and `use` checks the app gives
	// it; the `language()` inside is then handed `resolve` as reading only
	// `BaseContext`, since a context that is a type parameter defers the check.
	const detected = language<Language>({
		...detect,
		supported,
		fallback,
		...(resolve === undefined
			? {}
			: { resolve: resolve as (ctx: BaseContext) => string | undefined }),
	});
	const plugin = definePlugin<RequiresOf<Ctx, 'resolve'>>()((app) =>
		app
			.around((_ctx, next) => current.run({}, () => requests.run({}, next)))
			.plugin(detected)
			.derive(({ language: lang }): I18nContext<Key> => {
				const own = current.getStore();
				if (own !== undefined) own.language = lang;
				const heard = requests.getStore();
				if (heard !== undefined) heard.language ??= lang;
				return { t: translate(lang) };
			}),
	);

	return Object.assign(plugin, {
		/** Translates into the current request's language, or the fallback outside one. */
		t: ((key, context) => translate(spoken())(key, context)) as Translate<Key>,
		/** The current request's language, or the fallback outside one. */
		language: spoken,
		supported,
	});
}
