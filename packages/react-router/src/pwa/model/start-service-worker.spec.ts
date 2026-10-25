import { afterEach, describe, expect, mock, test } from 'bun:test';
import { startServiceWorker } from './start-service-worker';

class FakeWorker extends EventTarget {
	state = 'installed';
	postMessage() {}
}

class FakeRegistration extends EventTarget {
	waiting: FakeWorker | null = null;
	installing: FakeWorker | null = null;
	update = async () => {};
}

/** A container that controls the page, so a waiting worker is an update. */
class FakeContainer extends EventTarget {
	controller: unknown = {};
	registration = new FakeRegistration();
	register = mock(async (_url: string, _options: unknown) => this.registration);
}

const realDocument = globalThis.document;
afterEach(() => {
	globalThis.document = realDocument;
});
function stubLoadedDocument() {
	globalThis.document = {
		readyState: 'complete',
		visibilityState: 'visible',
		addEventListener: () => {},
	} as unknown as Document;
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const asEnvironment = (container?: FakeContainer) => ({
	navigator: container ? { serviceWorker: container as never } : {},
});

describe('startServiceWorker', () => {
	test('registers nothing unless enabled', async () => {
		stubLoadedDocument();
		const container = new FakeContainer();
		startServiceWorker(asEnvironment(container), {
			enabled: false,
			notice: { offer: mock() },
		});
		await flush();
		expect(container.register).not.toHaveBeenCalled();
	});

	test('does nothing in a browser with no serviceWorker', () => {
		stubLoadedDocument();
		const offer = mock();
		expect(() =>
			startServiceWorker(asEnvironment(), { enabled: true, notice: { offer } }),
		).not.toThrow();
	});

	test('registers url and scope, and offers a waiting version to the notice', async () => {
		stubLoadedDocument();
		const container = new FakeContainer();
		const waiting = new FakeWorker();
		container.registration.waiting = waiting;
		const offer = mock();
		startServiceWorker(asEnvironment(container), {
			enabled: true,
			url: '/w.js',
			scope: '/app/',
			notice: { offer },
		});
		await flush();
		expect(container.register).toHaveBeenCalledWith('/w.js', {
			scope: '/app/',
		});
		expect(offer).toHaveBeenCalledTimes(1);
	});

	test('defaults url and scope', async () => {
		stubLoadedDocument();
		const container = new FakeContainer();
		startServiceWorker(asEnvironment(container), {
			enabled: true,
			notice: { offer: mock() },
		});
		await flush();
		expect(container.register).toHaveBeenCalledWith('/service-worker.js', {
			scope: '/',
		});
	});

	test('onError receives the rejection', async () => {
		stubLoadedDocument();
		const container = new FakeContainer();
		const failure = new Error('blocked');
		container.register = mock(async () => {
			throw failure;
		});
		const onError = mock();
		startServiceWorker(asEnvironment(container), {
			enabled: true,
			notice: { offer: mock() },
			onError,
		});
		await flush();
		expect(onError).toHaveBeenCalledWith(failure);
	});

	test('a rejection with no onError is dropped', async () => {
		stubLoadedDocument();
		const container = new FakeContainer();
		container.register = mock(async () => {
			throw new Error('blocked');
		});
		startServiceWorker(asEnvironment(container), {
			enabled: true,
			notice: { offer: mock() },
		});
		await flush();
	});
});
