import { data } from 'react-router';
import { isApiErrorLike } from './api-error';
import type { ApiErrors } from './api-errors';
import type { FormErrors } from './form-errors';
import { type RouteErrorOptions, routeError } from './route-error';

/**
 * Runs a form's mutation. An `ApiError` becomes the form's errors: each
 * refused field (`extensions.fields`, or the one `extensions.field` names)
 * under the form field `fieldOf` names (else on the form), and any other
 * code as the form's message. A 404 about none of the form's fields (the
 * record itself is gone), a 401 and other failures go to the error page.
 */
export async function submitForm<L extends string, T>(
	errors: Pick<ApiErrors<L>, 'apiErrorMessage' | 'fieldErrors'>,
	language: L,
	run: () => Promise<T>,
	fieldOf: (path: string) => string | undefined,
	route?: RouteErrorOptions,
): Promise<{ ok: true; value: T } | ReturnType<typeof data<FormErrors>>> {
	try {
		return { ok: true, value: await run() };
	} catch (error) {
		if (!isApiErrorLike(error) || error.status === 401) {
			throw routeError(error, route);
		}
		const field = error.errors[0]?.extensions?.field;
		if (error.status === 404 && !(field && fieldOf(field))) {
			throw routeError(error, route);
		}
		const byField: Record<string, string> = {};
		const unplaced: string[] = [];
		for (const [path, message] of Object.entries(
			errors.fieldErrors(error, language),
		)) {
			const field = fieldOf(path);
			if (field) byField[field] = message;
			else unplaced.push(message);
		}
		const formError =
			Object.keys(byField).length && !unplaced.length
				? undefined
				: [errors.apiErrorMessage(error, language), ...unplaced].join(' ');
		return data({ fieldErrors: byField, formError }, { status: error.status });
	}
}
