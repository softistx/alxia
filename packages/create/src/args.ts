/** The command line of `create-alxia`, read into what to create. */

/** The command's name, which starts every line it prints to stderr. */
export const NAME = 'create-alxia';

/** The templates, in the order the prompt lists them. */
export const TEMPLATES = ['minimal', 'api', 'graphql', 'react-router'] as const;
export type Template = (typeof TEMPLATES)[number];

/** The templates as a sentence: `minimal, api, graphql or react-router`. */
export const TEMPLATE_LIST = `${TEMPLATES.slice(0, -1).join(', ')} or ${TEMPLATES.at(-1)}`;

export function isTemplate(value: string): value is Template {
	return (TEMPLATES as readonly string[]).includes(value);
}

/** What the arguments asked for. A missing `dir` or `template` is prompted. */
export interface Options {
	readonly dir?: string;
	readonly template?: Template;
	readonly install: boolean;
	readonly help: boolean;
}

/** The arguments as options, or the message that refuses them. */
export function parseArgs(
	args: readonly string[],
): Options | { readonly error: string } {
	let dir: string | undefined;
	let template: Template | undefined;
	let install = true;
	let help = false;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] as string;
		if (arg === '--help' || arg === '-h') help = true;
		else if (arg === '--no-install') install = false;
		else if (
			arg === '--template' ||
			arg === '-t' ||
			arg.startsWith('--template=')
		) {
			const value = arg.includes('=')
				? arg.slice(arg.indexOf('=') + 1)
				: args[++i];
			if (value === undefined || value === '') {
				return { error: `${arg} needs a template: ${TEMPLATE_LIST}.` };
			}
			if (!isTemplate(value)) {
				return {
					error: `unknown template ${value}: use ${TEMPLATE_LIST}.`,
				};
			}
			template = value;
		} else if (arg.startsWith('-')) return { error: `unknown option ${arg}.` };
		else if (dir === undefined) dir = arg;
		else return { error: `one directory only, given ${dir} and ${arg}.` };
	}
	return {
		...(dir === undefined ? {} : { dir }),
		...(template === undefined ? {} : { template }),
		install,
		help,
	};
}
