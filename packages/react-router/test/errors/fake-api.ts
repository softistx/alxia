import type { CatalogueReply, ErrorCatalogueOptions } from '../../src/errors';
import { createApiMessages, createErrorCatalogue } from '../../src/errors';
import { format, type Lang } from './format';

export const CODE = 'todos.errors.title-taken';
export const TTL = 30_000;

/**
 * A fake API behind `read` and `versions`: it counts the calls, serves a
 * text and a version per language, and can be taken down or held back.
 */
export function fakeApi() {
	const texts: Record<Lang, string> = { en: 'Taken.', fr: 'Pris.' };
	const versions: Record<Lang, string> = { en: 'v1', fr: 'v1' };
	const api = {
		calls: [] as string[],
		down: false,
		/** When set, every call waits for it first. */
		gate: undefined as Promise<void> | undefined,
		say(language: Lang, text: string) {
			texts[language] = text;
			versions[language] = `${versions[language]}+`;
		},
		async read(language: Lang): Promise<CatalogueReply> {
			api.calls.push(`read ${language}`);
			await api.gate;
			if (api.down) throw new Error('down');
			return {
				version: versions[language],
				messages: [
					{ code: CODE, message: texts[language], params: [] },
					{
						code: 'validation.errors.required',
						message: 'Required.',
						params: [],
					},
					{ code: 'notes.errors.other', message: 'Other.', params: [] },
				],
			};
		},
		async versions(): Promise<Partial<Record<Lang, string>>> {
			api.calls.push('versions');
			await api.gate;
			if (api.down) throw new Error('down');
			return { ...versions };
		},
	};
	return api;
}

/** An error catalogue on a fake API, with a log that records instead of printing. */
export function catalogueOn(
	api = fakeApi(),
	options: Partial<ErrorCatalogueOptions<Lang>> = {},
) {
	const messages = createApiMessages<Lang>({ format });
	const logged: string[] = [];
	const catalogue = createErrorCatalogue<Lang>({
		messages,
		languages: ['en', 'fr'],
		read: (language) => api.read(language),
		versions: () => api.versions(),
		ttlMs: TTL,
		clientCodes: ['validation.errors.required', 'missing.errors.code'],
		log: { error: (message: string) => void logged.push(message) },
		...options,
	});
	const said = (language: Lang = 'en') =>
		messages.apiMessage(CODE, {}, language);
	return { api, messages, catalogue, logged, said };
}
