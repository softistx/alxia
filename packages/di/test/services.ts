/**
 * A Container the specs share: a singleton, a Slot read from the request,
 * and a scoped value that records when it is made and disposed of.
 */

import { mock } from 'bun:test';
import { container, token } from '@nxgt/di';

export interface User {
	readonly id: string;
}

export const Config = token<{ region: string }>()('config');
export const Principal = token<User>()('principal');
export const Greeting = token<string>()('greeting');

export function services(events: string[] = []) {
	return container()
		.provide(Config, () => ({ region: 'eu' }))
		.slot(Principal)
		.provide(
			Greeting,
			async ({ get }) => {
				events.push('created');
				return `hello ${(await get(Principal)).id}`;
			},
			{ lifetime: 'scoped', dispose: () => void events.push('disposed') },
		);
}

/** A `slots` that reads `x-user`, counting its calls. */
export function slotsFromHeader() {
	return mock((ctx: { request: Request }) => ({
		principal: { id: ctx.request.headers.get('x-user') ?? 'anonymous' },
	}));
}
