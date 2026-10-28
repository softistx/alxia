import type { StepUpState } from '../../model/step-up';

/** Where a step-up is, as a dialog shows it. */
export type StepUpDialogPhase =
	| 'asking'
	| 'failed'
	| 'code'
	| 'expired'
	| 'confirmed';

/** The phase a reducer state is in: what the dialog shows. */
export function stepUpDialogPhase(state: StepUpState): StepUpDialogPhase {
	if (state.phase === 'done') return 'confirmed';
	if (state.challenge) return 'code';
	if (state.error === 'expired') return 'expired';
	return state.error ? 'failed' : 'asking';
}

/** Whether an answer is a refusal asking for a step-up (`stepUp` set, not ok). */
export function asksStepUp(answer: unknown): boolean {
	if (typeof answer !== 'object' || answer === null) return false;
	const a = answer as { ok?: unknown; stepUp?: unknown };
	return !a.ok && Boolean(a.stepUp);
}
