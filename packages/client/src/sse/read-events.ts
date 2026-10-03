/**
 * A `text/event-stream` body as the values its events carry: each event's
 * `data`, parsed as JSON, or `{ event, data, id? }` for an event sent with a
 * name, as a named `eventStream` sends every one. Comments — the server's
 * keep-alives — and events with no data are skipped.
 */
export async function* readEvents(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
	const decoder = new TextDecoder();
	let buffer = '';
	for await (const chunk of body) {
		buffer += decoder.decode(chunk, { stream: true });
		// A CR ending the chunk may be the first half of a CRLF: kept for the next.
		const kept = buffer.endsWith('\r') ? '\r' : '';
		const lines = buffer
			.slice(0, buffer.length - kept.length)
			.replace(/\r\n?/g, '\n');
		let start = 0;
		let end = lines.indexOf('\n\n');
		while (end !== -1) {
			const event = eventOf(lines.slice(start, end));
			if (event !== undefined) yield event.value;
			start = end + 2;
			end = lines.indexOf('\n\n', start);
		}
		buffer = lines.slice(start) + kept;
	}
	const event = eventOf(buffer.replace(/\r\n?/g, '\n'));
	if (event !== undefined) yield event.value;
}

/**
 * What one event reads as, boxed so that a `null` is still an event; none
 * for an event with no data, which an `EventSource` does not dispatch either.
 */
function eventOf(text: string): { value: unknown } | undefined {
	const data: string[] = [];
	let name = '';
	let id: string | undefined;
	for (const line of text.split('\n')) {
		if (line === '' || line.startsWith(':')) continue;
		const colon = line.indexOf(':');
		const field = colon === -1 ? line : line.slice(0, colon);
		let value = colon === -1 ? '' : line.slice(colon + 1);
		if (value.startsWith(' ')) value = value.slice(1);
		if (field === 'data') data.push(value);
		else if (field === 'event') name = value;
		else if (field === 'id' && !value.includes('\0')) id = value;
	}
	if (data.length === 0) return undefined;
	const parsed: unknown = JSON.parse(data.join('\n'));
	if (name === '') return { value: parsed };
	return {
		value:
			id === undefined
				? { event: name, data: parsed }
				: { event: name, data: parsed, id },
	};
}
