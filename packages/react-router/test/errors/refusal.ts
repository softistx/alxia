import { ApiError } from '@nxgt/graphql-client';
import { createApiErrors, createApiMessages } from '../../src/errors';
import { CATALOGUE } from './catalogue';
import { format, type Lang } from './format';

/** A real `ApiError`, as `@nxgt/graphql-client` builds one from a response's `errors`. */
export function refusal(
	code: string | undefined,
	message: string,
	extensions: Record<string, unknown> = {},
	httpStatus = 200,
) {
	return new ApiError(
		[{ message, extensions: code ? { code, ...extensions } : extensions }],
		null,
		httpStatus,
	);
}

export function filledMessages() {
	const messages = createApiMessages<Lang>({ format });
	messages.set('en', CATALOGUE.en);
	messages.set('fr', CATALOGUE.fr);
	return messages;
}

/** The app's words for what the catalogue does not hold. */
export const GENERIC: Record<Lang, string> = {
	en: 'This request could not be processed.',
	fr: "Cette demande n'a pas pu être traitée.",
};

const UNAVAILABLE: Record<Lang, string> = {
	en: 'The service is unavailable.',
	fr: 'Le service est indisponible.',
};

/** Wording as S makes it: the API's message is the fallback. */
export function plainErrors() {
	return createApiErrors<Lang>({
		messages: filledMessages(),
		unavailable: (language) => UNAVAILABLE[language],
	});
}

/** Wording as H makes it: a generic refusal, and one word for the request limits. */
export function strictErrors() {
	return createApiErrors<Lang>({
		messages: filledMessages(),
		unavailable: (language) => UNAVAILABLE[language],
		refused: (language) => GENERIC[language],
		byCode: {
			'validation.errors.query-too-deep': (_error, language) =>
				language === 'fr' ? 'Requête trop lourde.' : 'Query too heavy.',
			'validation.errors.query-too-wide': (_error, language) =>
				language === 'fr' ? 'Requête trop lourde.' : 'Query too heavy.',
		},
	});
}
