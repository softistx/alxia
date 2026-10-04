/** The catalogues, the instance and the type probe the i18n specs share. */
import type { Middleware } from '@alxia/core';
import { resources as shared } from '@nxgt/i18n';
import { createI18n } from '../src/i18n';

/** What a middleware requires of the app that uses it: what its context reads beyond the base. */
export type Reads<M> =
	M extends Middleware<infer Requires, infer _Result> ? Requires : never;
export const reads = <M>(_middleware: M) => undefined as unknown as Reads<M>;

export const en = {
	...shared.en,
	home: {
		title: 'Welcome',
		items: '{count, plural, =0 {No items} one {One item} other {# items}}',
	},
} as const;
export const fr = {
	...shared.fr,
	home: {
		title: 'Bienvenue',
		items:
			'{count, plural, =0 {Aucun article} one {Un article} other {# articles}}',
	},
} as const;

export const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });
