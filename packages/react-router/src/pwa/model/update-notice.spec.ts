import { describe, expect, test } from 'bun:test';
import {
	createUpdateNotice,
	sessionStore,
	UPDATE_LATER_KEY,
} from './update-notice';

/** A session storage in memory. */
function memory() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
	};
}

describe('createUpdateNotice', () => {
	test('nothing to say until a new version waits', () => {
		const notice = createUpdateNotice(memory);
		expect(notice.current()).toBeUndefined();
		let reloaded = 0;
		notice.offer(() => {
			reloaded += 1;
		});
		notice.current()?.reload();
		expect(reloaded).toBe(1);
	});

	test('Later hides it for the session: a page loaded again keeps it hidden', () => {
		const session = memory();
		const first = createUpdateNotice(() => session);
		let changes = 0;
		first.subscribe(() => {
			changes += 1;
		});
		first.offer(() => {});
		first.current()?.later();
		expect(first.current()).toBeUndefined();
		expect(changes).toBe(2);
		// The same tab, its next page load: the waiting version is offered again.
		const next = createUpdateNotice(() => session);
		next.offer(() => {});
		expect(next.current()).toBeUndefined();
		// Another visit (a new session): offered.
		const visit = createUpdateNotice(memory);
		visit.offer(() => {});
		expect(visit.current()).toBeDefined();
	});

	test('without storage, Later still hides it on this page', () => {
		const blocked = {
			getItem: () => {
				throw new Error('SecurityError');
			},
			setItem: () => {
				throw new Error('SecurityError');
			},
		};
		const notice = createUpdateNotice(() => blocked);
		notice.offer(() => {});
		expect(notice.current()).toBeDefined();
		notice.current()?.later();
		expect(notice.current()).toBeUndefined();
	});

	test('the same notice until it changes, as useSyncExternalStore needs', () => {
		const notice = createUpdateNotice(memory);
		notice.offer(() => {});
		expect(notice.current()).toBe(notice.current());
	});

	test('Later is stored under the key it was given', () => {
		const session = memory();
		const notice = createUpdateNotice(() => session, 'my-app.later');
		notice.offer(() => {});
		notice.current()?.later();
		expect(session.getItem('my-app.later')).toBe('1');
		expect(session.getItem(UPDATE_LATER_KEY)).toBeNull();
	});

	test('two keys do not share Later', () => {
		const session = memory();
		const first = createUpdateNotice(() => session, 'a.later');
		first.offer(() => {});
		first.current()?.later();
		const second = createUpdateNotice(() => session, 'b.later');
		second.offer(() => {});
		expect(second.current()).toBeDefined();
	});

	test("the default key is alxia's", () => {
		expect(UPDATE_LATER_KEY).toBe('alxia.update-later');
	});
});

describe('sessionStore', () => {
	test('is a function, and gives nothing where there is no sessionStorage', () => {
		expect(typeof sessionStorage === 'undefined').toBe(
			sessionStore() === undefined,
		);
	});
});
