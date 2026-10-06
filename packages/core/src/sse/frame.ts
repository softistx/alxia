/**
 * One event of a `text/event-stream` body as it is written: its `event:`,
 * `id:` and `retry:` fields, then its data as JSON on `data:` lines.
 */
import type { ValidationIssue } from '../errors/errors';
import { commentText, SseComment } from './comment';

/**
 * An event with fields of its own, as a named stream's validator gives it
 * to the writer. A plain value yielded by any other stream is sent as its
 * `data` alone, so a `{ event }` object a handler yields without a named
 * schema stays JSON.
 */
export class Frame {
	readonly event: string;
	readonly data: unknown;
	readonly id: string | undefined;
	readonly retry: number | undefined;

	constructor(
		event: string,
		data: unknown,
		id: string | undefined,
		retry: number | undefined,
	) {
		this.event = event;
		this.data = data;
		this.id = id;
		this.retry = retry;
	}
}

/**
 * `value` as the text of one event, or of a comment when it is an
 * `SseComment`: a `Frame`'s fields, then its data, each
 * line of it on a `data:` line of its own, and the blank line ending it.
 */
export function frameText(value: unknown): string {
	if (value instanceof SseComment) return commentText(value);
	const lines: string[] = [];
	let data = value;
	if (value instanceof Frame) {
		lines.push(`event: ${value.event}`);
		if (value.id !== undefined) lines.push(`id: ${value.id}`);
		if (value.retry !== undefined) lines.push(`retry: ${value.retry}`);
		data = value.data;
	}
	const json = JSON.stringify(data) ?? 'null';
	for (const line of json.split(/\r\n|\r|\n/)) lines.push(`data: ${line}`);
	return `${lines.join('\n')}\n\n`;
}

/**
 * The error of an event its schema refuses, each issue at its path, under
 * the event's name on a named stream.
 */
export function mismatch(
	issues: readonly ValidationIssue[],
	name?: string,
): TypeError {
	return new TypeError(
		`An event does not match its schema: ${issues
			.map((issue) => {
				const path = name === undefined ? issue.path : [name, ...issue.path];
				return `${path.join('.') || '(root)'}: ${issue.message}`;
			})
			.join('; ')}`,
	);
}

/** A line break, or NUL, which an `EventSource` reads as no id at all. */
const BREAK = /[\r\n\0]/;

/** Why `name` cannot be an event's name, or `undefined` when it can. */
export function refuseName(name: string): string | undefined {
	if (name === '') return 'An event name must not be empty';
	if (BREAK.test(name)) {
		return `An event name must not hold a line break or a NUL: ${JSON.stringify(name)}`;
	}
	return undefined;
}

/** Why `id` cannot be an event's id, or `undefined` when it can. */
export function refuseId(id: unknown): string | undefined {
	if (id === undefined) return undefined;
	if (typeof id !== 'string') return 'An event id must be a string';
	if (BREAK.test(id)) {
		return `An event id must not hold a line break or a NUL: ${JSON.stringify(id)}`;
	}
	return undefined;
}

/** Why `retry` cannot be an event's retry, or `undefined` when it can. */
export function refuseRetry(retry: unknown): string | undefined {
	if (retry === undefined) return undefined;
	if (typeof retry !== 'number' || !Number.isSafeInteger(retry) || retry < 0) {
		return `An event retry must be a whole number of milliseconds, 0 or more: ${String(retry)}`;
	}
	return undefined;
}
