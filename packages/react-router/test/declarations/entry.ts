// The /entry exports behind exported values whose types are inferred: a
// declaration build must be able to name each one through
// `@alxia/react-router/entry` alone (TS2883 otherwise).

import {
	createEntry,
	type Entry,
	type EntryOptions,
	type HandleRequest,
	handleRequest,
	streamTimeout,
} from '@alxia/react-router/entry';
import type { ServerEntryModule } from 'react-router';

export const entry = createEntry({ streamTimeout: 8_000 });
export const handle: HandleRequest = entry.handleRequest;
export const options = (value: EntryOptions): EntryOptions => value;
export const defaults = { handleRequest, streamTimeout };

// A `number | undefined`, such as an env read, is a valid option under
// exactOptionalPropertyTypes; so is every other field given `undefined`.
declare const configured: number | undefined;
export const fromEnv: Entry = createEntry({
	streamTimeout: configured,
	nonce: undefined,
	isBot: undefined,
	onError: undefined,
});

// `streamTimeout` is a number, not the literal 5000.
export const timeout: number = streamTimeout;

// What entry.server exports is what React Router reads.
export const asServerEntry: Pick<ServerEntryModule, 'default'> = {
	default: handleRequest,
};
