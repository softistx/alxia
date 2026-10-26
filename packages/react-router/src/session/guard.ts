import type { JsonActions } from '../errors/json-actions';
import { refuseCrossSite } from '../errors/same-site';

/**
 * What every step that signs in, out, spends or mails runs first: a native
 * form post (before hydration) goes back to its page, which then posts JSON
 * (`json.requireJsonPost`), and a request from another site is a 403 even
 * when it is JSON (the `Origin` and `Sec-Fetch-Site` rule of `readJson`). It
 * reads headers only, never the body.
 */
export function samesitePost(json: JsonActions, request: Request): void {
	json.requireJsonPost(request);
	refuseCrossSite(json, request);
}
