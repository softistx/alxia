import { isApiErrorLike } from './api-error';
import type { ApiErrors } from './api-errors';

/** The API's refusal of `error`, or `undefined` when it is not one. */
export function refusalOf<L extends string>(
	errors: Pick<ApiErrors<L>, 'apiErrorMessage' | 'unavailableMessage'>,
	error: unknown,
	language: L,
): ReturnType<ApiErrors<L>['apiRefusal']> {
	if (isApiErrorLike(error)) {
		return {
			message: errors.apiErrorMessage(error, language),
			status: error.status,
		};
	}
	if (error instanceof Response && error.status === 503) {
		return { message: errors.unavailableMessage(language), status: 503 };
	}
	return undefined;
}

/** The worded message of each field an API error names, by field path. */
export function fieldErrorsOf<L extends string>(
	errors: Pick<ApiErrors<L>, 'apiErrorMessage' | 'translateCode'>,
	error: Parameters<ApiErrors<L>['fieldErrors']>[0],
	language: L,
): ReturnType<ApiErrors<L>['fieldErrors']> {
	const extensions = error.errors[0]?.extensions;
	if (!extensions?.fields?.length && extensions?.field) {
		return { [extensions.field]: errors.apiErrorMessage(error, language) };
	}
	return Object.fromEntries(
		(extensions?.fields ?? []).map(({ path, code, message, params }) => [
			path,
			errors.translateCode(code, message, language, params),
		]),
	);
}
