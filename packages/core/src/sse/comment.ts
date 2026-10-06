/**
 * A comment line of a `text/event-stream` body, which a handler yields
 * between its events: `yield sseComment('checkpoint')`.
 */

/** A comment a handler yields: it is written as `: text` lines, never as an event. */
export class SseComment {
	readonly text: string;

	constructor(text: string) {
		this.text = text;
	}
}

/**
 * A comment to yield from a stream, beside its events: a debug marker,
 * padding against a proxy that buffers, a heartbeat of the app's own. It is
 * sent as `: text`, a line an `EventSource` skips, and is never checked by
 * the stream's schema. Text on several lines is several `:` lines, and a
 * line break cannot end the comment: `'a\n\ndata: x'` is two comment lines.
 *
 * ```ts
 * yield sseComment('connected');
 * ```
 *
 * Text that is not a string throws a `TypeError`.
 */
export function sseComment(text: string): SseComment {
	if (typeof text !== 'string') {
		throw new TypeError(`A comment is a string: ${String(text)}`);
	}
	return new SseComment(text);
}

/**
 * The text of a comment as it is written: each of its lines behind a colon,
 * which the format reads as a comment, and the blank line ending the block.
 * Every line break an `EventSource` reads — `\r\n`, `\r`, `\n` — starts a new
 * `:` line, so nothing in `comment` reaches a field of its own.
 */
export function commentText(comment: SseComment): string {
	const lines = comment.text.split(/\r\n|\r|\n/);
	return `${lines.map((line) => `: ${line}`).join('\n')}\n\n`;
}
