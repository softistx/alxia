/** What the named event stream specs share: the JMAP push schemas, a body reader, a silenced log. */
import { z } from 'zod';
import { eventStream } from '../../src/sse/event-stream';

export const StateChange = z.object({
	'@type': z.literal('StateChange'),
	changed: z.record(z.string(), z.record(z.string(), z.string())),
});
export const Ping = z.object({ interval: z.number().int() });
export const Push = eventStream({ state: StateChange, ping: Ping });

export const change = {
	'@type': 'StateChange',
	changed: { a1: { Email: 's1' } },
} as const;

/** The body of `response` as text, with the error it ended with, if any. */
export async function readAll(
	response: Response,
): Promise<{ text: string; error: unknown }> {
	const reader = response.body?.getReader();
	if (reader === undefined) throw new Error('no body');
	const decoder = new TextDecoder();
	let text = '';
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) return { text, error: undefined };
			text += decoder.decode(value, { stream: true });
		}
	} catch (error) {
		return { text, error };
	}
}

/** Runs `body` with `console.error` collected instead of printed. */
export async function quietly<T>(
	body: (logged: unknown[]) => Promise<T>,
): Promise<T> {
	const original = console.error;
	const logged: unknown[] = [];
	console.error = (...args: unknown[]) => logged.push(...args);
	try {
		return await body(logged);
	} finally {
		console.error = original;
	}
}
