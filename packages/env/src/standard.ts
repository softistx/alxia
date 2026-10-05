/** [Standard Schema](https://standardschema.dev): Zod, Valibot, ArkType. */

export interface StandardIssue {
	readonly message: string;
	readonly path?:
		| readonly (PropertyKey | { readonly key: PropertyKey })[]
		| undefined;
}

export type StandardResult<Output> =
	| { readonly value: Output; readonly issues?: undefined }
	| { readonly issues: readonly StandardIssue[] };

export interface StandardSchema<Output> {
	readonly '~standard': {
		readonly version: 1;
		readonly vendor: string;
		readonly validate: (
			value: unknown,
		) => StandardResult<Output> | Promise<StandardResult<Output>>;
		readonly types?:
			| { readonly input: unknown; readonly output: Output }
			| undefined;
	};
}

/** What a schema gives back: its output type, after defaults and transforms. */
export type OutputOf<Schema extends StandardSchema<unknown>> = NonNullable<
	Schema['~standard']['types']
>['output'];

/** The dotted name of an issue's path: `ORIGINS.1`. */
export function pathOf(path: StandardIssue['path']): string {
	return (path ?? [])
		.map((key) => String(typeof key === 'object' ? key.key : key))
		.join('.');
}
