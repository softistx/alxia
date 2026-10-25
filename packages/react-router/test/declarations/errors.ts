// The /errors model behind exported values whose types are inferred: a
// declaration build must be able to name each one through
// `@alxia/react-router/errors` alone (TS2883 otherwise).

import {
	type ApiErrorLike,
	ApiMessagesProvider,
	apiCodeResolver,
	type CatalogueMessages,
	createApiMessages,
	type FormErrors,
	isApiErrorLike,
	nextOf,
	REQUEST_ID_HEADER,
	requestIdOf,
	waitMinutes,
} from '@alxia/react-router/errors';

export const minutes = waitMinutes({ retryAfter: 90 });

export const next = nextOf('https://a.test/todos.data?q=a');

export const header = REQUEST_ID_HEADER;

export function requestId(response: Response) {
	return requestIdOf(response);
}

export function refusal(error: unknown) {
	return isApiErrorLike(error) ? error : undefined;
}

export function codeOf(error: ApiErrorLike) {
	return error.errors[0]?.extensions?.code ?? error.code;
}

export const formErrors: FormErrors = { fieldErrors: { title: 'Required' } };

export const messages = createApiMessages<'en' | 'fr'>({
	format: (message) => message,
});

export const resolver = apiCodeResolver(messages, {
	translate: (key) => key,
	language: () => 'en',
});

export const catalogue: CatalogueMessages = {
	'todos.errors.title-taken': { message: 'Taken', params: [] },
};

export const provided = ApiMessagesProvider({
	messages,
	value: { en: catalogue, fr: catalogue },
	children: null,
});

// The language is typed: a language outside `L` is refused.
// @ts-expect-error 'de' is not 'en' | 'fr'
messages.apiMessage('todos.errors.title-taken', {}, 'de');

export const wrongProvided = ApiMessagesProvider({
	messages,
	// @ts-expect-error the value is keyed by 'en' and 'fr'
	value: { de: catalogue, es: catalogue },
	children: null,
});

export const wrongResolver = apiCodeResolver<'en' | 'fr'>(messages, {
	translate: (key) => key,
	// @ts-expect-error the language is not 'en' | 'fr'
	language: () => 'de',
});
