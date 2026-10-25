import { isApiErrorLike, valuesOf } from './api-error';
import type { ApiErrors, ApiErrorsOptions } from './api-errors';
import { API_CODE } from './code-resolver';
import { fetcherRefusal, fetcherResult } from './fetcher-result';
import { submitForm } from './submit-form';

export function describeApiErrors<L extends string>({
	messages,
	unavailable,
	refused,
	byCode = {},
	isApiCode = (code) => API_CODE.test(code),
}: ApiErrorsOptions<L>): ApiErrors<L> {
	const translateCode: ApiErrors<L>['translateCode'] = (
		code,
		fallback,
		language,
		values,
	) => {
		if (!code) return fallback;
		return messages.apiMessage(code, values, language) ?? fallback;
	};

	const apiErrorMessage: ApiErrors<L>['apiErrorMessage'] = (
		error,
		language,
	) => {
		const code = error.code;
		if (refused && (!code || !isApiCode(code))) return refused(language);
		const own = code && Object.hasOwn(byCode, code) ? byCode[code] : undefined;
		if (own) return own(error, language);
		return translateCode(
			code,
			error.message,
			language,
			valuesOf(error.errors[0]?.extensions),
		);
	};

	const unavailableMessage = (language: L) => unavailable(language);

	const apiRefusal: ApiErrors<L>['apiRefusal'] = (error, language) => {
		if (isApiErrorLike(error)) {
			return {
				message: apiErrorMessage(error, language),
				status: error.status,
			};
		}
		if (error instanceof Response && error.status === 503) {
			return { message: unavailableMessage(language), status: 503 };
		}
		return undefined;
	};

	const fieldErrors: ApiErrors<L>['fieldErrors'] = (error, language) => {
		const extensions = error.errors[0]?.extensions;
		if (!extensions?.fields?.length && extensions?.field) {
			return { [extensions.field]: apiErrorMessage(error, language) };
		}
		return Object.fromEntries(
			(extensions?.fields ?? []).map(({ path, code, message, params }) => [
				path,
				translateCode(code, message, language, params),
			]),
		);
	};

	const parts = { apiRefusal, apiErrorMessage, fieldErrors };

	return {
		translateCode,
		apiErrorMessage,
		unavailableMessage,
		fieldErrors,
		apiRefusal,
		fetcherRefusal: (error, language) => fetcherRefusal(parts, error, language),
		fetcherResult: (language, about, run) =>
			fetcherResult(parts, language, about, run),
		submitForm: (language, run, fieldOf) =>
			submitForm(parts, language, run, fieldOf),
	};
}
