/** What each route behind the cache says through `ctx.cache`, kept by request. */

/** What a route said through `ctx.cache`, for the response it is building. */
export interface Control {
	readonly tags: string[];
	skipped: boolean;
}

export function requestControls() {
	const controls = new WeakMap<Request, Control>();
	return {
		/** What the route said for `request`, once it has run. */
		get: (request: Request): Control | undefined => controls.get(request),
		/** A fresh control for `request`, and the hands a route is given to it. */
		open(request: Request) {
			const control: Control = { tags: [], skipped: false };
			controls.set(request, control);
			return {
				tag: (...tags: string[]) => {
					control.tags.push(...tags);
				},
				skip: () => {
					control.skipped = true;
				},
			};
		},
	};
}
