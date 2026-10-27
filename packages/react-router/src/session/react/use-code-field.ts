import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';

/** The part of a Standard Schema (`~standard`) this hook reads; Zod, Valibot and ArkType satisfy it. */
export interface CodeSchema {
	readonly '~standard': {
		validate(value: unknown): unknown;
	};
}

/**
 * Calls `handler` once for each new `refusal` (a new object each time,
 * `undefined` when there is none). A refusal already there when the
 * component mounted is not new: it is the page's own, seen again.
 * Library-agnostic: pair it with any form library's `reset` and `focus`.
 */
export function useOnRefusal(
	refusal: object | undefined,
	handler: () => void,
): void {
	const handled = useRef(refusal);
	const latest = useRef(handler);
	latest.current = handler;
	useEffect(() => {
		if (!refusal || handled.current === refusal) return;
		handled.current = refusal;
		latest.current();
	}, [refusal]);
}

export interface CodeField {
	/** The code typed so far. */
	readonly code: string;
	readonly setCode: (code: string) => void;
	/** On the input, so a refusal can focus it. */
	readonly ref: RefObject<HTMLInputElement | null>;
	/** The first issue's message of the last `check`, cleared by typing. */
	readonly error: string | undefined;
	/**
	 * Validates the code against the schema: the parsed value, or
	 * `undefined` and `error` set. Synchronous schemas only.
	 */
	readonly check: () => unknown;
}

/**
 * A one-code field (an authenticator app's code, a recovery code) with no
 * form library: it holds the code, checks it against `schema`, and on each
 * new `refusal` clears the refused code and focuses the input for the next
 * try. With react-hook-form, use `useOnRefusal` and its `setValue` and
 * `setFocus` instead.
 */
export function useCodeField(
	schema: CodeSchema,
	refusal: object | undefined,
): CodeField {
	const [code, setCodeState] = useState('');
	const [error, setError] = useState<string | undefined>();
	const ref = useRef<HTMLInputElement | null>(null);
	const setCode = useCallback((next: string) => {
		setCodeState(next);
		setError(undefined);
	}, []);
	useOnRefusal(refusal, () => {
		setCode('');
		ref.current?.focus();
	});
	const check = () => {
		const result = schema['~standard'].validate(code);
		if (result instanceof Promise) {
			throw new TypeError('useCodeField takes a synchronous schema');
		}
		const { issues, value } = result as {
			issues?: ReadonlyArray<{ message: string }>;
			value?: unknown;
		};
		if (issues?.length) {
			setError(issues[0]?.message);
			return undefined;
		}
		setError(undefined);
		return value;
	};
	return { code, setCode, ref, error, check };
}
