import { createTranslator, type TranslationContext } from '@nxgt/i18n';
import { holder, unique } from './lookup';
import type { Catalogues, Translate } from './types';

/** What a request keeps from the catalogues it started with. */
export interface Snapshot {
	readonly resources: Catalogues;
	readonly translator: (
		key: string,
		context?: TranslationContext,
		language?: never,
	) => string;
}

/** One request's frame, opened around everything after the middleware. */
export interface Frame {
	readonly snapshot: Snapshot;
	/** `fallBackTo`'s steps, in order. */
	readonly steps: string[];
	language?: string;
}

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
 * catalogues): its snapshot's catalogues, its chain. Until the chain is
 * used — no `fallbacks`, no step — a key the request's language lacks
 * answers itself.
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
		const found = chained
			? holder(resources, chainOf(steps, frame), key)
			: undefined;
		return translator(key, context, (found ?? language) as never);
	};
}
