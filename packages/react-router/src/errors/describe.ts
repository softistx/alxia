import { valuesOf } from './api-error';
import type { ApiErrors, ApiErrorsOptions } from './api-errors';
import { API_CODE } from './code-resolver';
import { fieldErrorsOf, refusalOf } from './describe-refusal';
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

	const apiRefusal: ApiErrors<L>['apiRefusal'] = (error, language) =>
		refusalOf({ apiErrorMessage, unavailableMessage }, error, language);

	const fieldErrors: ApiErrors<L>['fieldErrors'] = (error, language) =>
		fieldErrorsOf({ apiErrorMessage, translateCode }, error, language);

	const parts = { apiRefusal, apiErrorMessage, fieldErrors };

	return {
		translateCode,
		apiErrorMessage,
		unavailableMessage,
		fieldErrors,
		apiRefusal,
		fetcherRefusal: (error, language, route) =>
			fetcherRefusal(parts, error, language, route),
		fetcherResult: (language, about, run, route) =>
			fetcherResult(parts, language, about, run, route),
		submitForm: (language, run, fieldOf, route) =>
			submitForm(parts, language, run, fieldOf, route),
	};
}
