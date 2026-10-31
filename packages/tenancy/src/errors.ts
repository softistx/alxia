export type TenancyErrorCode =
	| 'tenancy.errors.organization-required'
	| 'tenancy.errors.unknown-organization'
	| 'tenancy.errors.slug-taken';

/**
 * A refusal of the tenancy layer: a stable `code` to translate, the HTTP
 * `status` to answer with and the `params` the message needs. The host maps
 * it to its own error type; nothing here knows how it reaches the client.
 */
export class TenancyError extends Error {
	constructor(
		readonly code: TenancyErrorCode,
		readonly status: 400 | 404 | 409,
		readonly params: Readonly<Record<string, string>> = {},
	) {
		super(code);
		this.name = 'TenancyError';
	}
}

/** A rollback target that no migration list holds. */
export class UnknownMigrationError extends Error {
	constructor(readonly id: string) {
		super(`rollback: "${id}" is in no migration list`);
		this.name = 'UnknownMigrationError';
	}
}

export const organizationRequired = (header: string) =>
	new TenancyError('tenancy.errors.organization-required', 400, { header });

export const unknownOrganization = () =>
	new TenancyError('tenancy.errors.unknown-organization', 404);

export const slugTaken = (slug: string) =>
	new TenancyError('tenancy.errors.slug-taken', 409, { slug });
