import { type BaseContext, definePlugin, type RequiresOf } from '@alxia/core';
import { decide, respond, type Settings } from './decide';
import type { LanguageContext, LanguageSource } from './types';

/**
 * `Ctx` is the type `resolve`'s parameter is annotated with —
 * `BaseContext & { user: User }`, or `{ user: User }` alone — and
 * `BaseContext` when it is not.
 */
export interface LanguageOptions<
	L extends string,
	Ctx extends object = BaseContext,
> {
	/** The languages the app speaks: the context's `language` is one of them. */
	readonly supported: readonly L[];
	/** The one it speaks when the request names none it does. */
	readonly fallback: NoInfer<L>;
	/** Where it looks, in order. `query`, `cookie`, then `header` by default. */
	readonly order?: readonly LanguageSource[];
	/** The query parameter: `?lang=fr`. `lang` by default. */
	readonly query?: string;
	/** The cookie. `language` by default. */
	readonly cookie?: string;
	/** The index of the path segment: `/fr/products` is 0. 0 by default. */
	readonly pathIndex?: number;
	/**
	 * Whether a language named by the query is kept in the cookie, so the
	 * next request speaks it too. Off by default.
	 */
	readonly persist?:
		| boolean
		| { readonly maxAge?: number; readonly secure?: boolean };
	/** Says `Content-Language` on every response. On by default. */
	readonly contentLanguage?: boolean;
	/**
	 * Decides itself, after every source: a user's saved preference. Annotate
	 * its parameter to read what an earlier plugin adds —
	 * `(ctx: BaseContext & { user: User })` — and the app that uses the
	 * plugin must then give it.
	 */
	readonly resolve?: (ctx: BaseContext & Ctx) => string | undefined;
	/**
	 * The request headers `resolve` reads, added to `Vary` so a cache keeps
	 * one response per value: `['authorization']`. None by default.
	 */
	readonly vary?: readonly string[];
}

/**
 * The request's language, as a plugin: the routes declared after it read
 * `language`, typed as one of `supported` — never a string a client made
 * up. It is read from the query, a cookie, a path segment and
 * `Accept-Language` — weights, `fr-CA` for `fr`, `fr` for `fr-FR` — in the
 * order given, then `fallback`.
 *
 * ```ts
 * app.use(language({ supported: ['en', 'fr'], fallback: 'en' }))
 *    .get('/', ({ language, reply }) => reply(200, language)); // 'en' | 'fr'
 * ```
 */
export function language<
	const L extends string,
	Ctx extends object = BaseContext,
>(options: LanguageOptions<L, Ctx>) {
	const settings: Settings<L> = {
		supported: options.supported,
		fallback: options.fallback,
		order: options.order ?? ['query', 'cookie', 'header'],
		query: options.query ?? 'lang',
		cookie: options.cookie ?? 'language',
		pathIndex: options.pathIndex ?? 0,
		persist:
			options.persist === true
				? {}
				: options.persist === false
					? undefined
					: options.persist,
		contentLanguage: options.contentLanguage !== false,
		// `use` has checked that the app gives what `resolve` reads.
		resolve: options.resolve as Settings<L>['resolve'],
		vary: options.vary ?? [],
	};
	if (!settings.supported.includes(settings.fallback)) {
		throw new TypeError(
			`language(): the fallback "${settings.fallback}" is not supported`,
		);
	}
	return definePlugin<RequiresOf<Ctx, 'resolve'>>()((app) =>
		app.derive((ctx): LanguageContext<L> => {
			const found = decide(settings, ctx);
			respond(settings, ctx, found);
			return found;
		}),
	);
}
