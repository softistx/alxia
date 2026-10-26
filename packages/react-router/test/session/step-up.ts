import { createApiErrors } from '../../src/errors';
import { type StepUpStepsOptions, stepUpSteps } from '../../src/session';
import type { Lang } from '../errors/format';
import { filledMessages, refusal } from '../errors/refusal';
import { flowFor } from './flow';

export const errors = createApiErrors<Lang>({
	messages: filledMessages(),
	unavailable: () => 'The service is unavailable.',
});

/** Step-up steps over the catalogue, with plain wording; `omit` drops options. */
export const steps = (
	overrides: Partial<Omit<StepUpStepsOptions<Lang>, 'signIn'>> = {},
	omit: readonly (keyof StepUpStepsOptions<Lang>)[] = [],
) => {
	const { flow } = flowFor({
		errors,
		attemptsLeft: (count, language) => `${count} left (${language})`,
	});
	const options: StepUpStepsOptions<Lang> = {
		signIn: flow,
		spent: (language) => `ask again (${language})`,
		locked: (language) => `wait (${language})`,
		...overrides,
	};
	for (const key of omit)
		delete (options as unknown as Record<string, unknown>)[key];
	return stepUpSteps<Lang>(options);
};

export const wrong = (attemptsLeft?: number) =>
	refusal('CODE_INVALID', 'Wrong code', {
		...(attemptsLeft === undefined ? {} : { attemptsLeft }),
		http: { status: 401 },
	});

export const down = () => new Response('down', { status: 503 });
