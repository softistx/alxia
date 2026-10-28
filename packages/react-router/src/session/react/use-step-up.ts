import { useEffect, useReducer, useRef, useState } from 'react';
import {
	INITIAL_STEP_UP,
	type StepUpConfirmAnswer,
	type StepUpProps,
	type StepUpRequestAnswer,
	type StepUpState,
	type StepUpVia,
	stepUpProps,
	stepUpReducer,
} from '../model';

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

/**
 * One step-up intent as the host posts it: its own `post` (so the fields stay
 * typed by the host's action), the settled answer it got since it mounted
 * (`undefined` before), and whether it is in flight. `reset` forgets the
 * answer (a fetcher's `reset`).
 */
export interface StepUpChannel<Fields, Answer> {
	post(fields: Fields): void;
	readonly answer: Answer | undefined;
	readonly busy: boolean;
	reset?(): void;
}

export interface StepUpOptions {
	/** Posts `{ intent: 'request-step-up' }`, to the route that serves `stepUpSteps().route`. */
	request: StepUpChannel<Record<string, never>, StepUpRequestAnswer>;
	/** Posts `{ intent: 'confirm-step-up', challenge, code, via }`. */
	confirm: StepUpChannel<
		{ challenge: string; code: string; via: StepUpVia | undefined },
		StepUpConfirmAnswer
	>;
	/** Runs once the API accepted the code. */
	onConfirmed(): void;
}

/**
 * The step-up as the page lives it, on `stepUpReducer`: `start` asks for a
 * challenge, `submit` posts the code, and once it is accepted `onConfirmed`
 * runs. The challenge lives in the reducer's state and the channels' answers
 * only; `release` forgets everything.
 */
export function useStepUp({ request, confirm, onConfirmed }: StepUpOptions) {
	const [state, dispatch] = useReducer(stepUpReducer, INITIAL_STEP_UP);
	const confirmedRun = useRef(onConfirmed);
	confirmedRun.current = onConfirmed;

	// Each settled answer once, even one worded as the last (a new object).
	const handledRequest = useRef(request.answer);
	const handledConfirm = useRef(confirm.answer);
	useEffect(() => {
		const answer = request.answer;
		if (!answer || handledRequest.current === answer) return;
		handledRequest.current = answer;
		dispatch({ type: 'requested', answer });
	}, [request.answer]);
	useEffect(() => {
		const answer = confirm.answer;
		if (!answer || handledConfirm.current === answer) return;
		handledConfirm.current = answer;
		dispatch({ type: 'confirmed', answer });
		if (answer.ok) confirmedRun.current();
	}, [confirm.answer]);

	return {
		phase: stepUpDialogPhase(state),
		/** How the challenge held (or the last one) is confirmed. */
		via: state.via,
		/** What a dialog words its texts from (`stepUpProps`). */
		props: stepUpProps(state),
		/** The last refusal worded by the server: the fallback of the dialog's own words. */
		message: state.message,
		/** A request or a code is in flight. */
		busy: request.busy || confirm.busy,
		/** Asks for a challenge: the first, or "Resend code" / "New code". */
		start() {
			dispatch({ type: 'start' });
			request.post({});
		},
		/** Posts the code for the challenge held. */
		submit(code: string) {
			if (!state.challenge) return;
			dispatch({ type: 'submit' });
			confirm.post({ challenge: state.challenge, code, via: state.via });
		},
		/** Forgets the challenge, the answers and the errors. */
		release() {
			request.reset?.();
			confirm.reset?.();
			handledRequest.current = undefined;
			handledConfirm.current = undefined;
			dispatch({ type: 'release' });
		},
	};
}

/** Whether an answer is a refusal asking for a step-up (`stepUp` set, not ok). */
export function asksStepUp(answer: unknown): boolean {
	if (typeof answer !== 'object' || answer === null) return false;
	const a = answer as { ok?: unknown; stepUp?: unknown };
	return !a.ok && Boolean(a.stepUp);
}

export interface StepUpReplayOptions<Action> extends StepUpOptionsChannels {
	/**
	 * The settled answer of the sensitive action. A refusal carrying `stepUp`
	 * opens the step-up; the first answer after the replay closes it.
	 */
	answer: unknown;
	/** Sends the refused action again, once the session is confirmed. */
	replay(): void;
	/** The action that was refused, for `spendsCode`. */
	action?: Action | undefined;
	/**
	 * Whether the action carries a one-time code that a step-up by the
	 * second factor just spent. Such an action is not replayed: the dialog
	 * closes and `confirmedNotice` is true ("confirmed, type a new code").
	 */
	spendsCode?(action: Action): boolean;
}

type StepUpOptionsChannels = Pick<StepUpOptions, 'request' | 'confirm'>;

/**
 * The step-up a sensitive action asks for: an answer carrying `stepUp` opens
 * it; once the session is confirmed the same action is sent again by itself
 * (`replay`), except an action that `spendsCode` after a step-up by the
 * second factor, whose code was just spent: the user types the next one
 * (`confirmedNotice`). The dialog stays, saying so, until the replayed
 * action is answered. Generic over the host's `post`s, so each intent keeps
 * its typed fields.
 *
 * @example
 * const { open, dialogProps, cancel, confirmedNotice } = useStepUpReplay({
 * 	answer: fetcher.data,
 * 	replay: () => post(lastAction.current),
 * 	request: { post: ({}) => stepUpPost({ intent: 'request-step-up' }), answer, busy },
 * 	confirm: { post: (f) => stepUpPost({ intent: 'confirm-step-up', ...f }), answer, busy },
 * });
 */
export function useStepUpReplay<Action = never>({
	answer,
	replay,
	action,
	spendsCode,
	request,
	confirm,
}: StepUpReplayOptions<Action>) {
	const [open, setOpen] = useState(false);
	const [confirmedNotice, setConfirmedNotice] = useState(false);
	const replaying = useRef(false);
	const latest = useRef({ replay, action, spendsCode });
	latest.current = { replay, action, spendsCode };

	const stepUp = useStepUp({
		request,
		confirm,
		onConfirmed() {
			const { replay, action, spendsCode } = latest.current;
			const spent =
				stepUpRef.current.via === 'secondFactor' &&
				action !== undefined &&
				spendsCode?.(action) === true;
			if (spent) {
				stepUpRef.current.release();
				setOpen(false);
				setConfirmedNotice(true);
				return;
			}
			// The dialog stays, saying so, until the action is answered.
			replaying.current = true;
			replay();
		},
	});
	const stepUpRef = useRef(stepUp);
	stepUpRef.current = stepUp;

	// Each answer once: a refusal asking for a step-up opens it; the answer
	// of the replayed action closes it (a new step-up opens it again).
	const handled = useRef(answer);
	useEffect(() => {
		if (!answer || handled.current === answer) return;
		handled.current = answer;
		if (asksStepUp(answer)) {
			replaying.current = false;
			setConfirmedNotice(false);
			setOpen(true);
			stepUpRef.current.start();
			return;
		}
		setConfirmedNotice(false);
		if (replaying.current) {
			replaying.current = false;
			setOpen(false);
			stepUpRef.current.release();
		}
	}, [answer]);

	function cancel() {
		replaying.current = false;
		stepUp.release();
		setOpen(false);
		setConfirmedNotice(false);
	}

	const dialogProps: StepUpDialogProps = {
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
	return {
		open,
		/** True after a step-up by the second factor spent the action's own code. */
		confirmedNotice,
		dialogProps,
		/** Closes the dialog without sending the action again. */
		cancel,
		stepUp,
	};
}

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
