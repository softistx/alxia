import { createTranslator, type TranslationContext } from '@nxgt/i18n';
import { holder, unique } from './lookup';
import type { Catalogues, Translate } from './types';

/** What a request keeps from the catalogues it started with. */
export interface Snapshot {
	readonly resources: Catalogues;
	readonly translator: (
		key: string,
		context?: TranslationContext,
		language?: string,
	) => string;
}

/** One request's frame, opened around everything after the middleware. */
export interface Frame {
	readonly snapshot: Snapshot;
	/** `fallBackTo`'s steps, in order. */
	readonly steps: string[];
	language?: string;
}

/**
 * A translator over no catalogue: it answers the key, formatted as ICU as
 * `@nxgt/i18n` does. `@nxgt/i18n` 3 looks a missing key up in its own global
 * fallback language (`getFallbackLanguage()`, `'en'` unless set), which is not
 * this package's `fallback`; a key no language of the chain holds therefore
 * never reaches the catalogues' translator.
 */
const unanswered = createTranslator<string>({});

/** The catalogues, ready to translate. */
export const snapshotOf = (resources: Catalogues): Snapshot => ({
	resources,
	translator: createTranslator<string>(resources as Record<string, unknown>),
});

/** What decides a chain: the `fallback` and the `fallbacks` option. */
export interface Steps {
	readonly fallback: string;
	readonly fallbacks?: ((language: string) => readonly string[]) | undefined;
}

/** The chain of a request (none: outside one): its language, its steps, `fallbacks`, `fallback`. */
export function chainOf(
	{ fallback, fallbacks }: Steps,
	frame: Frame | undefined,
): string[] {
	const language = frame?.language ?? fallback;
	return unique(
		language,
		...(frame?.steps ?? []),
		...(fallbacks?.(language) ?? []),
		fallback,
	);
}

/**
 * `t` for the frame `of` answers (none: outside a request, the `live`
 * catalogues): its snapshot's catalogues, its chain. The language that holds
 * the key is found here, in the chain's order, and handed to `@nxgt/i18n`,
 * whose own fallback lookup therefore never runs. Until the chain is used —
 * no `fallbacks`, no step — only the request's language is tried, and a key it
 * lacks answers itself.
 */
export function translateFor(
	steps: Steps,
	of: () => Frame | undefined,
	live: () => Snapshot,
): Translate<string> {
	return (key, context?: TranslationContext) => {
		const frame = of();
		const { resources, translator } = frame?.snapshot ?? live();
		const language = frame?.language ?? steps.fallback;
		const chained =
			steps.fallbacks !== undefined || (frame?.steps.length ?? 0) > 0;
		const found = holder(
			resources,
			chained ? chainOf(steps, frame) : [language],
			key,
		);
		return found === undefined
			? unanswered(key, context, language)
			: translator(key, context, found);
	};
}
