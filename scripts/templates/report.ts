/** Prints `ok` or `FAIL` and the check's name; whether it passed. */
export function report(passed: boolean, what: string): boolean {
	console.log(`${passed ? 'ok  ' : 'FAIL'} ${what}`);
	return passed;
}
