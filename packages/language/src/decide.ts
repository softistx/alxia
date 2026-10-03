import { type BaseContext, vary } from '@alxia/core';
import { match, negotiate } from './negotiate';
import type { LanguageContext, LanguageSource } from './types';

/** `language()`'s options, their defaults applied. */
export interface Settings<L extends string> {
	readonly supported: readonly L[];
	readonly fallback: L;
	readonly order: readonly LanguageSource[];
	readonly query: string;
	readonly cookie: string;
	readonly pathIndex: number;
	readonly persist:
		| { readonly maxAge?: number; readonly secure?: boolean }
		| undefined;
	readonly contentLanguage: boolean;
	readonly resolve: ((ctx: BaseContext) => string | undefined) | undefined;
	readonly vary: readonly string[];
}

/** The language of one source, if it names one `supported` has. */
function read<L extends string>(
	settings: Settings<L>,
	ctx: BaseContext,
	source: LanguageSource,
): L | undefined {
	const { supported } = settings;
	switch (source) {
		case 'query': {
			const value = ctx.url.searchParams.get(settings.query);
			return value === null ? undefined : match(value, supported);
		}
		case 'cookie': {
			const value = new Bun.CookieMap(
				ctx.request.headers.get('cookie') ?? '',
			).get(settings.cookie);
			return value === null ? undefined : match(value, supported);
		}
		case 'path': {
			const segment = ctx.url.pathname.split('/').filter(Boolean)[
				settings.pathIndex
			];
			return segment === undefined ? undefined : match(segment, supported);
		}
		case 'header':
			return negotiate(ctx.request.headers.get('accept-language'), supported);
	}
}

/** The request's language: each source in `order`, then `resolve`, then `fallback`. */
export function decide<L extends string>(
	settings: Settings<L>,
	ctx: BaseContext,
): LanguageContext<L> {
	for (const source of settings.order) {
		const value = read(settings, ctx, source);
		if (value !== undefined) return { language: value, languageSource: source };
	}
	const resolved = settings.resolve?.(ctx);
	const value =
		resolved === undefined ? undefined : match(resolved, settings.supported);
	return value === undefined
		? { language: settings.fallback, languageSource: 'fallback' }
		: { language: value, languageSource: 'resolve' };
}

/** What the response says of it: `Vary`, `Content-Language`, the kept cookie. */
export function respond<L extends string>(
	settings: Settings<L>,
	ctx: BaseContext,
	found: LanguageContext<L>,
): void {
	const { headers, cookies } = ctx.set;
	if (settings.order.includes('header')) vary(headers, 'Accept-Language');
	if (settings.order.includes('cookie')) vary(headers, 'Cookie');
	for (const name of settings.vary) vary(headers, name);
	if (settings.contentLanguage) headers.set('content-language', found.language);
	const { persist } = settings;
	if (persist !== undefined && found.languageSource === 'query') {
		cookies.set(settings.cookie, found.language, {
			path: '/',
			sameSite: 'lax',
			httpOnly: false,
			secure: persist.secure ?? true,
			maxAge: persist.maxAge ?? 365 * 24 * 60 * 60,
		});
	}
}
