import { type MessageValues, valuesFor } from './message-values';

export type { MessageValues } from './message-values';

/** How a message uses an argument (the API's `ErrorParamKind`). */
export type ParamKind = 'TEXT' | 'NUMBER' | 'DATE' | 'PLURAL' | 'SELECT';

/**
 * One text of the API's error catalogue: the uninterpolated ICU message and
 * the arguments it names, which say what to supply as a date or a number
 * without parsing the message.
 */
export type CatalogueMessage = {
	message: string;
	params: ReadonlyArray<{ name: string; kind: ParamKind }>;
};

/** A language's messages by API code (`<module>.errors.<slug>`). */
export type CatalogueMessages = Readonly<Record<string, CatalogueMessage>>;

/**
 * Formats an ICU message for a language: plurals, numbers and dates of that
 * language. `@nxgt/material`'s `formatMessage` is one, as it is. It reports
 * a message it could not format (a missing value, a stray brace) to
 * `onError` instead of throwing.
 */
export type MessageFormat<L extends string> = (
	message: string,
	language: L,
	values: MessageValues,
	options: { onError(error: unknown): void },
) => string;

export interface ApiMessagesOptions<L extends string> {
	/** The app's ICU formatter: the same engine as its translator, so both word alike. */
	format: MessageFormat<L>;
}

/** The catalogue the page words refusals with, by language. */
export interface ApiMessages<L extends string> {
	/** Replaces a language's messages (a server's whole catalogue). */
	set(language: L, messages: CatalogueMessages): void;
	/** Adds messages to a language's (a browser's, from the root's data). */
	add(language: L, messages: CatalogueMessages): void;
	/** Forgets every message (tests). */
	clear(): void;
	/** The message the catalogue holds for a code in a language, if any. */
	messageOf(language: L, code: string): CatalogueMessage | undefined;
	/**
	 * A message formatted for `language` with `values`. Undefined when it
	 * cannot be formatted with those values (a missing argument, a day it
	 * cannot read) or does not parse.
	 */
	format(
		entry: CatalogueMessage,
		values: Readonly<Record<string, unknown>> | undefined,
		language: L,
	): string | undefined;
	/**
	 * The catalogue's text of an API code in `language`, with `values`
	 * (`extensions.params`) filled in. Undefined when the catalogue has no
	 * such code or the message cannot be formatted, so the caller falls back
	 * to the message the API already worded.
	 */
	apiMessage(
		code: string,
		values: Readonly<Record<string, unknown>> | undefined,
		language: L,
	): string | undefined;
}

/**
 * A catalogue store for the languages `L`. It is an instance, not module
 * state: two copies of the package never split it, and a spec makes its own.
 * Make one per app, in a module of its own, and share it with
 * `apiCodeResolver` and `ApiMessagesProvider`.
 */
export function createApiMessages<L extends string>({
	format,
}: ApiMessagesOptions<L>): ApiMessages<L> {
	const catalogues = new Map<L, Map<string, CatalogueMessage>>();

	const messageOf = (language: L, code: string) =>
		catalogues.get(language)?.get(code);

	function formatEntry(
		entry: CatalogueMessage,
		values: Readonly<Record<string, unknown>> | undefined,
		language: L,
	) {
		const worded = valuesFor(entry.params, values ?? {});
		// A message that did not format is reported here, not logged: the
		// caller falls back.
		let failed = false;
		const text = format(entry.message, language, worded, {
			onError: () => {
				failed = true;
			},
		});
		return failed ? undefined : text;
	}

	return {
		set(language, messages) {
			catalogues.set(language, new Map(Object.entries(messages)));
		},
		add(language, messages) {
			const held = catalogues.get(language) ?? new Map();
			for (const [code, message] of Object.entries(messages)) {
				held.set(code, message);
			}
			catalogues.set(language, held);
		},
		clear() {
			catalogues.clear();
		},
		messageOf,
		format: formatEntry,
		apiMessage(code, values, language) {
			const entry = messageOf(language, code);
			return entry ? formatEntry(entry, values, language) : undefined;
		},
	};
}
