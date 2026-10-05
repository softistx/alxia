/**
 * Yoga reads the request body itself, and turns any failure of the read
 * into its own 400. A body past core's `bodyLimit` fails the read with a
 * `ContentTooLargeError`; `watchBody` keeps that error, so the handler
 * can throw it again once Yoga has answered, and the app's own boundary
 * answers the 413 in its error format, leaking nothing of Yoga's.
 */
import { ContentTooLargeError } from '@alxia/core';

export interface WatchedRequest {
	/** The request to hand to Yoga: the same, its body watched. */
	readonly request: Request;
	/** The `ContentTooLargeError` the body's read failed with, if it did. */
	refusal(): ContentTooLargeError | undefined;
}

/** `request` with its body's failure recorded; a request with no body is as it is. */
export function watchBody(request: Request): WatchedRequest {
	const source = request.body;
	if (source === null || request.bodyUsed || source.locked) {
		return { request, refusal: () => undefined };
	}
	let refused: ContentTooLargeError | undefined;
	const reader = source.getReader();
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { value, done } = await reader.read();
				if (done) controller.close();
				else controller.enqueue(value);
			} catch (error) {
				if (error instanceof ContentTooLargeError) refused = error;
				throw error;
			}
		},
		cancel: (reason) => reader.cancel(reason),
	});
	return {
		request: new Request(request, { body, duplex: 'half' } as RequestInit),
		refusal: () => refused,
	};
}

interface Failure {
	errors?: { extensions?: Record<string, unknown> }[];
}

/**
 * Yoga's 400 for a request it cannot read — a body that is not JSON, a
 * query string that is not valid — carries the parser's own error as
 * `extensions.originalError`. A client reads the message and the code, not
 * what a parser said: the response without it, any other as it is.
 */
export async function withoutOriginalError(
	response: Response,
): Promise<Response> {
	const type = response.headers.get('content-type') ?? '';
	if (response.status !== 400 || !type.startsWith('application/json')) {
		return response;
	}
	const text = await response.text();
	let failure: Failure;
	try {
		failure = JSON.parse(text) as Failure;
	} catch {
		return new Response(text, response);
	}
	for (const error of failure.errors ?? []) {
		delete error.extensions?.['originalError'];
	}
	const headers = new Headers(response.headers);
	headers.delete('content-length');
	return new Response(JSON.stringify(failure), { status: 400, headers });
}
