/** The header an API echoes on every response: the id its logs carry. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** The request id a response carries, if the API sent one. */
export function requestIdOf(response: Response): string | undefined {
	return response.headers.get(REQUEST_ID_HEADER) || undefined;
}
