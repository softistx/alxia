// The /entry exports behind exported values whose types are inferred: a
// declaration build must be able to name each one through
// `@alxia/react-router/entry` alone (TS2883 otherwise).

import {
	createEntry,
	type EntryOptions,
	type HandleRequest,
	handleRequest,
	streamTimeout,
} from '@alxia/react-router/entry';

export const entry = createEntry({ streamTimeout: 8_000 });
export const handle: HandleRequest = entry.handleRequest;
export const options = (value: EntryOptions): EntryOptions => value;
export const defaults = { handleRequest, streamTimeout };
