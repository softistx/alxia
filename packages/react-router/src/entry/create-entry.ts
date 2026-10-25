import { createElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import {
	type EntryContext,
	type RouterContextProvider,
	ServerRouter,
} from 'react-router';
import { DocumentNonce } from '../document';
import { nonceOf } from '../nonce';
import { deadline, untilDone } from './abort';
import { wantsWholePage } from './whole-page';

export interface EntryOptions {
	/**
	 * Milliseconds React Router waits for a pending promise; the render itself
	 * is aborted 1 000 ms later. Export it as `streamTimeout`. Default 5 000.
	 */
	readonly streamTimeout?: number;
	/** This response's CSP nonce. Default `nonceOf(loadContext)`. */
	readonly nonce?: (
		loadContext: RouterContextProvider,
		request: Request,
	) => string | undefined;
	/** Whether a user agent is a bot, which gets the whole page. Default `isbot`. */
	readonly isBot?: (userAgent: string) => boolean;
	/** An error after the shell is out. Default `console.error`. */
	readonly onError?: (error: unknown) => void;
}

/** React Router's `handleRequest` export of `entry.server`. */
export type HandleRequest = (
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	routerContext: EntryContext,
	loadContext: RouterContextProvider,
) => Promise<Response>;

export const streamTimeout = 5_000;

/**
 * `entry.server`'s `handleRequest` and `streamTimeout`, on the web stream
 * renderer. Streams the shell, waits for the whole page for a bot and in
 * SPA mode, answers HEAD with no body, and gives the router the response's
 * CSP nonce.
 */
export function createEntry(options: EntryOptions = {}): {
	readonly handleRequest: HandleRequest;
	readonly streamTimeout: number;
} {
	const timeout = options.streamTimeout ?? streamTimeout;
	const nonceFor = options.nonce ?? nonceOf;
	const report = options.onError ?? console.error;

	const handleRequest: HandleRequest = async (
		request,
		responseStatusCode,
		responseHeaders,
		routerContext,
		loadContext,
	) => {
		responseHeaders.set('Content-Type', 'text/html');
		if (request.method === 'HEAD') {
			return new Response(null, {
				status: responseStatusCode,
				headers: responseHeaders,
			});
		}
		const nonce = nonceFor(loadContext, request);
		const limit = deadline(timeout + 1_000);
		let status = responseStatusCode;
		let shellOut = false;
		try {
			const body = await renderToReadableStream(
				createElement(
					DocumentNonce,
					{ nonce },
					createElement(ServerRouter, {
						context: routerContext,
						url: request.url,
						// Under exactOptionalPropertyTypes, ServerRouter's nonce takes no undefined.
						...(nonce === undefined ? {} : { nonce }),
					}),
				),
				{
					nonce,
					signal: limit.signal,
					onError(error: unknown) {
						status = 500;
						if (shellOut) report(error);
					},
				},
			);
			shellOut = true;
			if (wantsWholePage(request, routerContext.isSpaMode, options.isBot)) {
				await body.allReady;
			}
			return new Response(untilDone(body, limit.clear), {
				status,
				headers: responseHeaders,
			});
		} catch (error) {
			limit.clear();
			throw error;
		}
	};
	return { handleRequest, streamTimeout: timeout };
}

const defaults = createEntry();

/** The default entry: `export { handleRequest as default, streamTimeout } from '@alxia/react-router/entry'`. */
export const handleRequest: HandleRequest = defaults.handleRequest;
