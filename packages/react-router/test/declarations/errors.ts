// The /errors model behind exported values whose types are inferred: a
// declaration build must be able to name each one through
// `@alxia/react-router/errors` alone (TS2883 otherwise).

import {
	type ApiErrorLike,
	ApiMessagesProvider,
	type ApiRefusal,
	apiCodeResolver,
	type CatalogueMessages,
	createApiErrors,
	createApiMessages,
	errorRequestId,
	type FormErrors,
	isApiErrorLike,
	type JsonBody,
	jsonActions,
	nextOf,
	REQUEST_ID_HEADER,
	type RouteErrorData,
	type RouteErrorOptions,
	requestIdOf,
	routeError,
	type StandardSchemaV1,
	useJsonFetcher,
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

export const errors = createApiErrors({
	messages,
	unavailable: (language) =>
		language === 'en' ? 'Unavailable' : 'Indisponible',
	refused: () => 'Refused',
	byCode: { 'validation.errors.query-too-deep': () => 'Too heavy' },
});

export function refused(error: unknown): ApiRefusal | undefined {
	return errors.apiRefusal(error, 'en');
}

export function fields(error: ApiErrorLike) {
	return errors.fieldErrors(error, 'fr');
}

// The language is typed here too: a language outside `L` is refused.
// @ts-expect-error 'de' is not 'en' | 'fr'
errors.apiRefusal(new Error('x'), 'de');

export const wrongErrors = createApiErrors<'en' | 'fr'>({
	messages,
	// @ts-expect-error the language is not 'en' | 'fr'
	unavailable: (language: 'de') => language,
});

export const noUnavailable = createApiErrors<'en' | 'fr'>(
	// @ts-expect-error `unavailable` is required
	{ messages },
);

export const noMessages = createApiErrors<'en' | 'fr'>(
	// @ts-expect-error `messages` is required
	{ unavailable: () => '' },
);

export const routed = routeError(new Error('x'), {
	statuses: new Set([404]),
	requestIdHeader: 'x-trace',
});

export function requestOf(error: unknown): string | undefined {
	return errorRequestId(error);
}

export const routedData: RouteErrorData = { requestId: 'r-1' };

export const routedOptions: RouteErrorOptions = {};

export async function fetched(todo: string) {
	const result = await errors.fetcherResult('en', { todo }, async () => ({
		count: 1,
	}));
	return 'ok' in result ? result : result.data;
}

export function fetchedRefusal(error: unknown): ApiRefusal {
	return errors.fetcherRefusal(error, 'en');
}

export async function submitted() {
	const result = await errors.submitForm(
		'fr',
		async () => 1,
		(path) => (path === 'title' ? 'title' : undefined),
	);
	return 'ok' in result ? result.value : result.data;
}

// @ts-expect-error 'de' is not 'en' | 'fr'
errors.fetcherResult('de', {}, async () => ({}));

export const json = jsonActions({ origin: () => undefined });

export async function readName(request: Request) {
	const schema: StandardSchemaV1<unknown, { name: string }> = {
		'~standard': {
			version: 1,
			vendor: 'test',
			validate: (value) => ({ value: value as { name: string } }),
		},
	};
	const input = await json.readInput(request, schema);
	// The schema's output is what the action reads.
	const name: string = input.name;
	return name;
}

// @ts-expect-error a schema is required
json.readInput(new Request('http://a.test'));

export function rename() {
	const { fetcher, post, busy } = useJsonFetcher<{ ok: true }>('rename');
	const body: JsonBody = { name: 'a' };
	post(body, '/todos/1');
	return { data: fetcher.data, busy };
}

export function typedBody() {
	const { post } = useJsonFetcher<unknown, { name: string }>();
	post({ name: 'a' });
	// @ts-expect-error the body is { name: string }
	post({ title: 'a' });
}
