import { emitsOf, type Module } from '@alxia/modules';
import { isEventType } from './envelope';
import { EventsError } from './errors';
import type { Subscriber } from './types';

/** One module's handler for one event type. */
export interface Subscription {
	/** `<module>:<type>`: what `_inbox` and the job id name. */
	readonly id: string;
	readonly module: string;
	readonly type: string;
	readonly handler: Subscriber;
}

export const subscriptionId = (module: string, type: string) =>
	`${module}:${type}`;

/**
 * The registry's `emits`, by type. Refuses a malformed type or one a module
 * does not own; a type two modules declare is `emitsOf`'s `ModuleGraphError`.
 */
export function emittedTypes(modules: readonly Module[]): Map<string, string> {
	const owner = emitsOf(modules);
	for (const [type, name] of owner) {
		if (!isEventType(type)) {
			throw new EventsError(
				'events.invalid-type',
				`module "${name}" emits "${type}", which is not <module>.<entity>.<verb> in lower case`,
			);
		}
		if (type.split('.')[0] !== name) {
			throw new EventsError(
				'events.foreign-type',
				`module "${name}" emits "${type}", whose first segment is not its own name: a module emits only <module>.<entity>.<verb> of itself`,
			);
		}
	}
	return owner;
}

/**
 * Every subscriber of a registry, in registry order, by event type. Refuses a
 * subscriber of a type no module emits.
 */
export function subscriptionsOf(
	modules: readonly Module[],
	emitted: ReadonlyMap<string, string> = emittedTypes(modules),
): Map<string, Subscription[]> {
	const byType = new Map<string, Subscription[]>();
	for (const module of modules) {
		for (const [type, handler] of Object.entries(module.subscribers ?? {})) {
			if (!emitted.has(type)) {
				throw new EventsError(
					'events.unknown-subscription',
					`module "${module.name}" subscribes to "${type}", which no module in the registry emits`,
				);
			}
			const list = byType.get(type) ?? [];
			list.push({
				id: subscriptionId(module.name, type),
				module: module.name,
				type,
				handler: handler as unknown as Subscriber,
			});
			byType.set(type, list);
		}
	}
	return byType;
}
