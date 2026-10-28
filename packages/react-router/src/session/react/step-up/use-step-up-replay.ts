import { useEffect, useRef, useState } from 'react';
import { dialogPropsOf } from './dialog-props';
import { asksStepUp } from './phase';
import { type StepUpOptions, useStepUp } from './use-step-up';

export interface StepUpReplayOptions<Action>
	extends Pick<StepUpOptions, 'request' | 'confirm'> {
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
	 * The notice clears when `action` becomes another value (a new action was
	 * posted), at once and not at its answer, so pass the action as you post
	 * it, a new object for each post.
	 */
	spendsCode?(action: Action): boolean;
}

/**
 * The step-up a sensitive action asks for: an answer carrying `stepUp` opens
 * it; once the session is confirmed the same action is sent again by itself
 * (`replay`), except an action that `spendsCode` after a step-up by the
 * second factor, whose code was just spent: the user types the next one
 * (`confirmedNotice`). The dialog stays, saying so, until the replayed
 * action is answered; if that is refused for a step-up again, it asks again.
 * If `replay` posts nothing, no answer ends that wait: call `cancel()`.
 * Generic over the host's `post`s, so each intent keeps its typed fields.
 *
 * @example
 * const { open, dialogProps, cancel, confirmedNotice } = useStepUpReplay({
 * 	answer: fetcher.data,
 * 	replay: () => post(lastAction.current),
 * 	request: { post: () => stepUpPost({ intent: 'request-step-up' }), answer, busy },
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
	const isOpen = useRef(false);
	const replaying = useRef(false);
	const latest = useRef({ replay, action, spendsCode });
	latest.current = { replay, action, spendsCode };

	function show(value: boolean) {
		isOpen.current = value;
		setOpen(value);
	}

	// The notice belongs to the action it was shown for: another action
	// posted clears it at once, not at that action's answer.
	const noticeFor = useRef(action);
	useEffect(() => {
		if (noticeFor.current === action) return;
		noticeFor.current = action;
		setConfirmedNotice(false);
	}, [action]);

	const stepUp = useStepUp({
		request,
		confirm,
		onConfirmed() {
			// A code accepted after the host cancelled replays nothing.
			if (!isOpen.current) return;
			const { replay, action, spendsCode } = latest.current;
			const spent =
				stepUpRef.current.via === 'secondFactor' &&
				action !== undefined &&
				spendsCode?.(action) === true;
			if (spent) {
				stepUpRef.current.release();
				show(false);
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
			show(true);
			stepUpRef.current.start();
			return;
		}
		setConfirmedNotice(false);
		if (replaying.current) {
			replaying.current = false;
			show(false);
			stepUpRef.current.release();
		}
	}, [answer]);

	function cancel() {
		replaying.current = false;
		stepUp.release();
		show(false);
		setConfirmedNotice(false);
	}

	return {
		open,
		/** True after a step-up by the second factor spent the action's own code. */
		confirmedNotice,
		dialogProps: dialogPropsOf(stepUp, open, cancel),
		/** Closes the dialog without sending the action again. */
		cancel,
		stepUp,
	};
}
