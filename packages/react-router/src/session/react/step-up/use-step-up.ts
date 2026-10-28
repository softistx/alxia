import { useEffect, useReducer, useRef } from 'react';
import type { StepUpVia } from '../../model/second-factor';
import { INITIAL_STEP_UP, stepUpReducer } from '../../model/step-up';
import type {
	StepUpConfirmAnswer,
	StepUpRequestAnswer,
} from '../../model/step-up-answers';
import { stepUpProps } from '../../model/step-up-props';
import { stepUpDialogPhase } from './phase';

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
 * only; `release` forgets everything, and an answer that lands after it (a
 * request or a code in flight when the host closed) is ignored.
 */
export function useStepUp({ request, confirm, onConfirmed }: StepUpOptions) {
	const [state, dispatch] = useReducer(stepUpReducer, INITIAL_STEP_UP);
	const confirmedRun = useRef(onConfirmed);
	confirmedRun.current = onConfirmed;
	// True from `start` to `release`: only then are answers this step-up's.
	const live = useRef(false);

	// Each settled answer once, even one worded as the last (a new object).
	const handledRequest = useRef(request.answer);
	const handledConfirm = useRef(confirm.answer);
	useEffect(() => {
		const answer = request.answer;
		if (!answer || handledRequest.current === answer) return;
		handledRequest.current = answer;
		if (!live.current) return;
		dispatch({ type: 'requested', answer });
	}, [request.answer]);
	useEffect(() => {
		const answer = confirm.answer;
		if (!answer || handledConfirm.current === answer) return;
		handledConfirm.current = answer;
		if (!live.current) return;
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
			live.current = true;
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
			live.current = false;
			request.reset?.();
			confirm.reset?.();
			handledRequest.current = request.answer;
			handledConfirm.current = confirm.answer;
			dispatch({ type: 'release' });
		},
	};
}
