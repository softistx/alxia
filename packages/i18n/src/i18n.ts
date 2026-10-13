import { AsyncLocalStorage } from 'node:async_hooks';
import {
	type BaseContext,
	defineMiddleware,
	markFactory,
	type Next,
	type NextFunction,
	type RequiresOf,
	settle,
} from '@alxia/core';
import { type LanguageContext, language } from '@alxia/language';
import { registerLanguageSource } from '@nxgt/i18n';
import {
	chainOf,
	type Frame,
	type Snapshot,
	type Steps,
	snapshotOf,
	translateFor,
} from './chain';
import type {
	Catalogues,
	I18nContext,
	I18nMiddleware,
	I18nOptions,
	KeyOf,
	RuntimeI18nOptions,
} from './types';

/**
 * The request's language as `@nxgt/i18n` hears it: the first an i18n
 * middleware read, when an app uses several. Opened for each request —
 * one made from inside another included — by the first that runs on it.
 */
const requests = new AsyncLocalStorage<{ url: URL; language?: string }>();

/** Runs `work` with the request `url`'s store open: the one in force, or a fresh one. */
function hearing<T>(url: URL, work: () => T): T {
	return requests.getStore()?.url === url
		? work()
		: requests.run({ url }, work);
}

/** `@nxgt/i18n`'s source: one function, so registering it again keeps one. */
const requestLanguage = () => requests.getStore()?.language;

/** What the middleware of one `createI18n()` works with. */
interface Parts {
	readonly current: AsyncLocalStorage<Frame>;
	readonly detected: ReturnType<typeof language<string>>;
	readonly steps: Steps;
	readonly live: () => Snapshot;
}

type Added = LanguageContext<string> & I18nContext<string>;

/** The middleware: opens a request's frame around everything after it. */
function perRequest({ current, detected, steps, live }: Parts) {
	return defineMiddleware<object>()(function i18n(ctx, next): Promise<
		Next<Added>
	> {
		const own: Frame = { snapshot: live(), steps: [] };
		const bound = translateFor(steps, () => own, live);
		const found = (heard: LanguageContext<string>) => {
			own.language = heard.language;
			const store = requests.getStore();
			if (store !== undefined) store.language ??= heard.language;
			return settle(ctx, next({ ...heard, t: bound }));
		};
		// `language()`'s middleware, run inline: its `next` is this one's.
		const detecting = Object.assign(found, {
			behind: next.behind,
		}) as unknown as NextFunction;
		return current.run(own, () =>
			hearing(ctx.url, () => detected(ctx as never, detecting)),
		) as Promise<Next<Added>>;
	});
}

/**
 * Translations, as a middleware, on [`@nxgt/i18n`](https://www.npmjs.com/package/@nxgt/i18n):
 * `@alxia/language` reads the request's language among the catalogues', and
 * the routes declared after it read `language` and `t`, bound to it. Keys
 * are typed by the fallback's catalogue; messages are ICU — plurals,
 * selects, numbers — and a key missing in every language of the chain
 * answers itself.
 *
 * Its own `t()` translates anywhere a request runs after it — a service,
 * the answer to an error, a try/catch middleware's included — in that
 * request's language, and in the fallback outside.
 *
 * ```ts
 * const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });
 * app.use(i18n).get('/', ({ t, reply }) => reply(200, t('home.title')));
 * ```
 *
 * Catalogues that load at runtime take their keys as a type argument:
 * `createI18n<Key>({ fallback: 'en' })`, then `i18n.setResources(loaded)`.
 *
 * It registers the request's language as one of `@nxgt/i18n`'s language
 * sources, so its own `getLanguage()` and `translate` — and every nxgt
 * package that translates through them — speak it too.
 */
export function createI18n<
	const C extends Catalogues,
	const Fallback extends keyof C & string,
	Ctx extends object = BaseContext,
>(
	options: I18nOptions<C, Fallback, Ctx>,
): I18nMiddleware<
	keyof C & string,
	KeyOf<C[Fallback]>,
	RequiresOf<Ctx, 'resolve'>
>;
export function createI18n<
	Key extends string = never,
	Language extends string = string,
	Ctx extends object = BaseContext,
>(
	options: [Key] extends [never]
		? 'name the keys with createI18n<Key>(…), or give resources whose fallback is one of their languages'
		: RuntimeI18nOptions<Language, Ctx>,
): I18nMiddleware<Language, Key, RequiresOf<Ctx, 'resolve'>>;
export function createI18n(
	options: RuntimeI18nOptions<string, object>,
): I18nMiddleware<string, string, any> {
	const {
		resources: initial = {},
		languages,
		fallback,
		fallbacks,
		resolve,
		...detect
	} = options;
	if (
		options.resources !== undefined &&
		!Object.hasOwn(options.resources, fallback)
	) {
		throw new TypeError(
			`createI18n(): there is no catalogue for the fallback "${fallback}"`,
		);
	}
	const supported = [...(languages ?? Object.keys(initial))];
	if (languages === undefined && !supported.includes(fallback)) {
		supported.push(fallback);
	}
	let live: Snapshot = snapshotOf({ ...initial });
	const steps = { fallback, fallbacks };
	/**
	 * This middleware's frame for the request running, opened fresh for each
	 * request — one made from inside another included — around everything
	 * after it, the answer to an error included: `settle` answers it inside.
	 */
	const current = new AsyncLocalStorage<Frame>();
	const spoken = (): string => current.getStore()?.language ?? fallback;

	// nxgt's own getLanguage() and translate speak the request's language too.
	registerLanguageSource(requestLanguage);

	// The plugin requires what `resolve` reads, and `app.plugin` checks the app gives
	// it; the `language()` inside is then handed `resolve` as reading only
	// `BaseContext`, since a context that is a type parameter defers the check.
	const detected = language<string>({
		...detect,
		supported,
		fallback,
		...(resolve === undefined
			? {}
			: { resolve: resolve as (ctx: BaseContext) => string | undefined }),
	});
	const middleware = perRequest({
		current,
		detected,
		steps,
		live: () => live,
	});

	return Object.assign(middleware, {
		t: translateFor(
			steps,
			() => current.getStore(),
			() => live,
		),
		language: spoken,
		supported,
		chain: () => chainOf(steps, current.getStore()),
		fallBackTo(language: string) {
			current.getStore()?.steps.push(language);
		},
		setResources(resources: Catalogues) {
			if (!Object.hasOwn(resources, fallback)) {
				throw new TypeError(
					`setResources(): there is no catalogue for the fallback "${fallback}"`,
				);
			}
			live = snapshotOf({ ...resources });
			supported.splice(0, supported.length, ...Object.keys(resources));
		},
	}) as unknown as I18nMiddleware<string, string, any>;
}

markFactory(createI18n);
