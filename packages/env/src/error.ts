/** One refused variable. `expected` is the schema's type, when it tells. */
export interface EnvIssue {
	readonly path: string;
	readonly message: string;
	readonly expected?: string | undefined;
}

/** Every variable the schema refused. */
export class EnvError extends Error {
	override readonly name = 'EnvError';
	readonly issues: readonly EnvIssue[];

	constructor(issues: readonly EnvIssue[]) {
		super(
			`The environment is invalid:\n${issues
				.map(
					(issue) =>
						`  ${issue.path || '(root)'}: ${issue.message}${
							issue.expected === undefined ? '' : `; expected ${issue.expected}`
						}`,
				)
				.join('\n')}`,
		);
		this.issues = issues;
	}
}
