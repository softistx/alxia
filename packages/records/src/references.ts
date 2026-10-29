/** Anything with a collection name: a model, a definition, `{ name }`. */
export interface Named {
	readonly name: string;
}

/** A collection and the field of it that holds the id of an entity. */
export interface Referrer {
	/** The referring collection's name. */
	readonly collection: string;
	/** The field holding the id (a dotted path into an embedded object is fine). */
	readonly field: string;
}

/** Tells whether the referring collection still holds `id` in `referrer.field`. */
export type Exists<Id> = (
	referrer: Referrer,
	id: Id,
) => boolean | Promise<boolean>;

export interface References {
	/**
	 * Registers that `referrer.field` points at `entity`, once, beside the model
	 * that holds the pointer. Throws when the pair is already registered.
	 */
	referencedBy(entity: Named, referrer: Named, field: string): void;
	/** What points at `entity`, in registration order. */
	referrersOf(entity: Named): readonly Referrer[];
	/**
	 * Registers that `referrer.field` is derived from `entity` (a copy of the
	 * parent's field). It only names the target in `labelledFieldsOf`: it never
	 * feeds `referrersOf` nor `findReferrers`.
	 */
	labelledBy(entity: Named, referrer: Named, field: string): void;
	/** `field -> target name` for the fields of `referrer` that point at another collection or are derived from one. */
	labelledFieldsOf(referrer: Named): Map<string, string>;
	/** `field -> target name` for the registered pointers of `referrer` alone. */
	referenceFieldsOf(referrer: Named): Map<string, string>;
	/**
	 * Every referrer of `entity` that still holds `id`, as `exists` answers, in
	 * registration order. Sequential: `exists` reads through the caller's
	 * transaction, which runs one operation at a time.
	 */
	findReferrers<Id>(
		entity: Named,
		id: Id,
		exists: Exists<Id>,
	): Promise<Referrer[]>;
}

/** A registry of references. Make one per application and share it. */
export function createReferences(): References {
	const registry = new Map<string, Referrer[]>();
	const labelled = new Map<string, Map<string, string>>();

	const referrersOf = (entity: Named): readonly Referrer[] =>
		registry.get(entity.name) ?? [];

	const referenceFieldsOf = (referrer: Named): Map<string, string> => {
		const fields = new Map<string, string>();
		for (const [target, referrers] of registry) {
			for (const r of referrers) {
				if (r.collection === referrer.name) fields.set(r.field, target);
			}
		}
		return fields;
	};

	return {
		referrersOf,
		referenceFieldsOf,
		referencedBy(entity, referrer, field) {
			const known = registry.get(entity.name) ?? [];
			if (
				known.some((r) => r.collection === referrer.name && r.field === field)
			) {
				throw new Error(
					`referencedBy: ${referrer.name}.${field} already references ${entity.name}`,
				);
			}
			registry.set(entity.name, [
				...known,
				{ collection: referrer.name, field },
			]);
		},
		labelledBy(entity, referrer, field) {
			const fields = labelled.get(referrer.name) ?? new Map<string, string>();
			if (fields.has(field)) {
				throw new Error(
					`labelledBy: ${referrer.name}.${field} already has a label target`,
				);
			}
			labelled.set(referrer.name, fields.set(field, entity.name));
		},
		labelledFieldsOf(referrer) {
			return new Map([
				...referenceFieldsOf(referrer),
				...(labelled.get(referrer.name) ?? []),
			]);
		},
		async findReferrers(entity, id, exists) {
			const found: Referrer[] = [];
			for (const referrer of referrersOf(entity)) {
				if (await exists(referrer, id)) found.push(referrer);
			}
			return found;
		},
	};
}

/**
 * The stable snake_case code of a referring collection (`relatedPersons`
 * becomes `related_persons`), what a refusal's `kinds` param lists.
 */
export const kindOf = (referrer: Pick<Referrer, 'collection'>): string =>
	referrer.collection.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/**
 * The `kinds` param of a refused purge: the referring collections that still
 * hold a reference, de-duplicated, sorted and comma-joined. No counts and no
 * ids: the viewer may not be allowed to read those records.
 */
export const kindsOf = (referrers: readonly Referrer[]): string =>
	[...new Set(referrers.map(kindOf))].sort().join(',');
