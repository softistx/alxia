// The /errors model behind exported values whose types are inferred: a
// declaration build must be able to name each one through
// `@alxia/react-router/errors` alone (TS2883 otherwise).

import {
	type ApiErrorLike,
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
