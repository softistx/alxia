import type { StepUpVia } from '../../model/second-factor';
import type { StepUpProps } from '../../model/step-up-props';
import type { StepUpDialogPhase } from './phase';
import type { useStepUp } from './use-step-up';

/** What a step-up dialog is given: the phase to show and the handlers. */
export interface StepUpDialogProps {
	open: boolean;
	phase: StepUpDialogPhase;
	/** How the code is confirmed, once there is a challenge. */
	via: StepUpVia | undefined;
	/** The words of the code form (`stepUpProps`). */
	props: StepUpProps;
	/** The last refusal worded by the server. */
	message: string | undefined;
	busy: boolean;
	/** The code was accepted and the action is being sent again. */
	confirming: boolean;
	onCancel(): void;
	/** "Retry" after a refused request or an over challenge. */
	onRetry(): void;
	onSubmit(code: string): void;
	/** "Resend code", for a mailed code only. */
	onResend: (() => void) | undefined;
}

/** The dialog's props out of a step-up: plain, so any host can build them. */
export function dialogPropsOf(
	stepUp: ReturnType<typeof useStepUp>,
	open: boolean,
	cancel: () => void,
): StepUpDialogProps {
	return {
		open,
		phase: stepUp.phase,
		via: stepUp.phase === 'code' ? stepUp.via : undefined,
		props: stepUp.props,
		message: stepUp.message,
		busy: stepUp.busy,
		confirming: stepUp.phase === 'confirmed',
		onCancel: cancel,
		onRetry: () => stepUp.start(),
		onSubmit: (code) => stepUp.submit(code),
		onResend: stepUp.via === 'email' ? () => stepUp.start() : undefined,
	};
}
