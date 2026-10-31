import { isObjectId } from '@nxgt/mongo';
import type { ObjectId } from 'mongodb';

const TENANT_ID = /^[0-9a-f]{24}$/;

/**
 * The id of an organisation as it names a database: the 24 hex digits of an
 * `ObjectId`. Nothing else reaches a database name, so a name can never be
 * forged from a header, a slug or a path.
 */
export function isTenantId(value: unknown): value is string {
	return typeof value === 'string' && TENANT_ID.test(value);
}

/** How a tenant id becomes a database name: a prefix (`<prefix><id>`) or a function. */
export type DatabaseNaming = string | ((tenantId: string) => string);

export function namer(naming: DatabaseNaming) {
	return (tenant: string | ObjectId): string => {
		const id = isObjectId(tenant) ? tenant.toHexString() : tenant;
		if (!isTenantId(id)) throw new TypeError('not an organization id');
		return typeof naming === 'string' ? `${naming}${id}` : naming(id);
	};
}

export type SlotNaming = ((tenantId: string) => string) & {
	/** The tenant ids holding a slot, by slot number minus one. */
	readonly held: () => string[];
	/** Frees the slot of a tenant. */
	release(tenantId: string): void;
	/** Frees every slot. */
	reset(): void;
};

/**
 * Database names for tests: `<prefix>_slot1`, `<prefix>_slot2`... Each new
 * tenant id takes the lowest free slot, so a suite creates at most `slots`
 * databases, however many tenants it provisions, and can drop them by name.
 * Throws a `RangeError` when every slot is taken.
 */
export function slotNaming(prefix: string, slots = 8): SlotNaming {
	if (!Number.isInteger(slots) || slots < 1) {
		throw new RangeError('at least one slot');
	}
	const held = new Map<string, number>();
	const naming = (tenantId: string) => {
		let slot = held.get(tenantId);
		if (slot === undefined) {
			const taken = new Set(held.values());
			for (let n = 1; n <= slots; n++) {
				if (!taken.has(n)) {
					slot = n;
					break;
				}
			}
			if (slot === undefined) {
				throw new RangeError(`all ${slots} database slots are taken`);
			}
			held.set(tenantId, slot);
		}
		return `${prefix}_slot${slot}`;
	};
	return Object.assign(naming, {
		held: () => {
			const out: string[] = [];
			for (const [id, slot] of held) out[slot - 1] = id;
			return out;
		},
		release: (tenantId: string) => {
			held.delete(tenantId);
		},
		reset: () => held.clear(),
	});
}
