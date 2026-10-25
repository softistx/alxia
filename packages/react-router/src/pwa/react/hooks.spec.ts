import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createUpdateNotice } from '../model/update-notice';
import { useOnline } from './use-online';
import { useServiceWorker } from './use-service-worker';
import { updateNotice, useUpdateNotice } from './use-update-notice';

/** Renders `use` on the server and returns the HTML of what it returned. */
function render(use: () => unknown) {
	return renderToString(
		createElement(() =>
			createElement('p', null, JSON.stringify(use() ?? null)),
		),
	);
}

describe('server render', () => {
	test('useOnline is online, as the first client render must be', () => {
		expect(render(useOnline)).toBe('<p>true</p>');
	});

	test('useUpdateNotice shows nothing', () => {
		expect(render(() => useUpdateNotice())).toBe('<p>null</p>');
	});

	test('useUpdateNotice shows nothing on the server even for a notice offered', () => {
		const offered = createUpdateNotice(() => undefined);
		offered.offer(() => {});
		expect(offered.current()).toBeDefined();
		expect(render(() => useUpdateNotice(offered))).toBe('<p>null</p>');
	});

	test('useServiceWorker renders, and registers nothing (effects do not run on the server)', () => {
		for (const enabled of [true, false]) {
			expect(
				render(() => {
					useServiceWorker({ enabled });
				}),
			).toBe('<p>null</p>');
		}
	});

	test('the page has one notice, and no worker offered it', () => {
		expect(updateNotice.current()).toBeUndefined();
	});
});
