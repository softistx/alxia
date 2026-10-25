import { afterEach, describe, expect, mock, test } from 'bun:test';
import {
	createUpdater,
	registerServiceWorker,
	watchForUpdates,
} from './registration';
import { SKIP_WAITING } from './worker-contract';

/** A ServiceWorker stand-in: its state, its statechange, its messages. */
class FakeWorker extends EventTarget {
	state = 'installing';
	messages: unknown[] = [];
	postMessage(message: unknown) {
		this.messages.push(message);
	}
	install() {
		this.state = 'installed';
		this.dispatchEvent(new Event('statechange'));
	}
}

class FakeRegistration extends EventTarget {
	waiting: FakeWorker | null = null;
	installing: FakeWorker | null = null;
	found(worker: FakeWorker) {
		this.installing = worker;
		this.dispatchEvent(new Event('updatefound'));
	}
}

const asRegistration = (fake: FakeRegistration) =>
	fake as unknown as ServiceWorkerRegistration;
const controlled = { controller: {} as ServiceWorker };
const uncontrolled = { controller: null };

describe('watchForUpdates', () => {
	test('offers a worker already waiting behind a controller', () => {
		const registration = new FakeRegistration();
		registration.waiting = new FakeWorker();
		const onWaiting = mock();
		watchForUpdates(asRegistration(registration), controlled, onWaiting);
		expect(onWaiting).toHaveBeenCalledWith(registration.waiting);
	});

	test('offers an update once it has installed', () => {
		const registration = new FakeRegistration();
		const onWaiting = mock();
		watchForUpdates(asRegistration(registration), controlled, onWaiting);
		const worker = new FakeWorker();
		registration.found(worker);
		expect(onWaiting).not.toHaveBeenCalled();
		worker.install();
		expect(onWaiting).toHaveBeenCalledWith(worker);
	});

	test('offers nothing on a first install: no controller to replace', () => {
		const registration = new FakeRegistration();
		const onWaiting = mock();
		watchForUpdates(asRegistration(registration), uncontrolled, onWaiting);
		const worker = new FakeWorker();
		registration.found(worker);
		worker.install();
		expect(onWaiting).not.toHaveBeenCalled();
	});
});

/** A ServiceWorkerContainer stand-in: its controller and controllerchange. */
class FakeContainer extends EventTarget {
	controller: unknown = {};
	takeControl(worker: FakeWorker) {
		worker.state = 'activated';
		this.controller = worker;
		this.dispatchEvent(new Event('controllerchange'));
	}
}

const asContainer = (fake: FakeContainer) =>
	fake as unknown as Pick<
		ServiceWorkerContainer,
		'controller' | 'addEventListener'
	>;

describe('createUpdater', () => {
	test('posts SKIP_WAITING, then reloads once the worker takes control', () => {
		const container = new FakeContainer();
		const reload = mock();
		const apply = createUpdater(asContainer(container), reload);
		const worker = new FakeWorker();
		worker.state = 'installed';
		apply(worker as unknown as ServiceWorker);
		expect(worker.messages).toEqual([{ type: SKIP_WAITING }]);
		expect(reload).not.toHaveBeenCalled();
		container.takeControl(worker);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	test('clicked twice, it reloads once', () => {
		const container = new FakeContainer();
		const reload = mock();
		const apply = createUpdater(asContainer(container), reload);
		const worker = new FakeWorker();
		worker.state = 'installed';
		apply(worker as unknown as ServiceWorker);
		apply(worker as unknown as ServiceWorker);
		container.takeControl(worker);
		container.dispatchEvent(new Event('controllerchange'));
		apply(worker as unknown as ServiceWorker);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	test('another tab activated the worker: no reload unasked, one reload on Reload', () => {
		const container = new FakeContainer();
		const reload = mock();
		const apply = createUpdater(asContainer(container), reload);
		const worker = new FakeWorker();
		worker.state = 'installed';
		// Tab A's SKIP_WAITING: the worker activates and claims this tab too.
		container.takeControl(worker);
		expect(reload).not.toHaveBeenCalled();
		apply(worker as unknown as ServiceWorker);
		expect(worker.messages).toEqual([]);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	test('a worker still activating reloads at once', () => {
		const reload = mock();
		const apply = createUpdater(asContainer(new FakeContainer()), reload);
		const worker = new FakeWorker();
		worker.state = 'activating';
		apply(worker as unknown as ServiceWorker);
		expect(reload).toHaveBeenCalledTimes(1);
	});
});

describe('registerServiceWorker', () => {
	const realDocument = globalThis.document;
	afterEach(() => {
		globalThis.document = realDocument;
	});

	test('registers options.url with options.scope, and checks for updates when the tab shows', async () => {
		const listeners = new Map<string, () => void>();
		globalThis.document = {
			visibilityState: 'visible',
			addEventListener: (type: string, listener: () => void) => {
				listeners.set(type, listener);
			},
		} as unknown as Document;
		const registration = new FakeRegistration() as FakeRegistration & {
			update: () => Promise<void>;
		};
		let updates = 0;
		registration.update = async () => {
			updates += 1;
		};
		const register = mock(async () => registration);
		const container = Object.assign(new FakeContainer(), { register });
		const onWaiting = mock();
		const result = await registerServiceWorker(
			container as unknown as Parameters<typeof registerServiceWorker>[0],
			onWaiting,
			{ url: '/worker.js', scope: '/app/' },
		);
		expect(result as unknown).toBe(registration);
		expect(register).toHaveBeenCalledWith('/worker.js', { scope: '/app/' });
		listeners.get('visibilitychange')?.();
		expect(updates).toBe(1);
	});
});
