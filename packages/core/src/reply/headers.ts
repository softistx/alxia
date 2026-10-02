/**
 * `response` with its headers edited. A response's headers may be
 * immutable — one from `fetch`, a `Response.redirect` — and then the edit
 * runs on a copy of them, and the response is rebuilt only once it
 * succeeds. An error of `edit` is thrown as it is, the body unread:
 * headers it set before throwing stay, but the caller can still send the
 * response.
 */
export function withHeaders(
	response: Response,
	edit: (headers: Headers) => void,
): Response {
	try {
		edit(response.headers);
		return response;
	} catch (error) {
		if (!immutable(response.headers)) throw error;
		const headers = new Headers(response.headers);
		edit(headers);
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	}
}

/** Whether `headers` refuse every edit; deleting an absent name changes nothing. */
function immutable(headers: Headers): boolean {
	try {
		headers.delete('x-alxia-immutable');
		return false;
	} catch {
		return true;
	}
}

/** Adds `value` to the `Vary` header, once. */
export function vary(headers: Headers, value: string): void {
	const current = headers.get('vary');
	if (current === null) {
		headers.set('vary', value);
		return;
	}
	const names = current.split(',').map((name) => name.trim().toLowerCase());
	if (!names.includes('*') && !names.includes(value.toLowerCase())) {
		headers.set('vary', `${current}, ${value}`);
	}
}
