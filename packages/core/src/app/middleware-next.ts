/**
 * What a middleware's `Call` is written with: the `next` it is given, one
 * `behind` shared by every call, a parked upgrade, and the error a misused
 * `next` throws, naming the route.
 */

import type { RouteDefinition, SocketDefinition } from './definition';
import type { Call } from './middleware-call';
import type { BaseContext } from './types';

export type Ctx = Record<string, unknown> & BaseContext;
export type Definition = RouteDefinition | SocketDefinition;

export function ignore(): void {}

/** Where `next` keeps its call, for the shared `behind`. */
export const CALL = Symbol('call');

/** `next` as a middleware is given it. */
export interface Next {
	(added?: object): Promise<Response>;
	behind: (this: Next, added?: object) => Promise<Response>;
	[CALL]: Call;
}

export function behind(this: Next, added?: object): Promise<Response> {
	return this[CALL].behind(added);
}

/** A socket's upgrade, parked behind the stand-in response `next()` resolved to. */
export interface Parked {
	readonly stand: Response;
	readonly value: unknown;
}

export function labelOf(definition: Definition): string {
	return `${'method' in definition ? definition.method : 'WS'} ${definition.path}`;
}

export function failure(definition: Definition, why: string): TypeError {
	return new TypeError(`${labelOf(definition)}: ${why}`);
}
