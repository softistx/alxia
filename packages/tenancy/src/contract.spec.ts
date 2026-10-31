import { describeTenantStore } from '../test/contract';
import {
	moduleWiring,
	mongoRegistry,
	openModuleCore,
	openModuleSingle,
	testModules,
	unique,
} from '../test/harness';
import { perOrganization, single } from '.';

const IDS: [string, string] = ['2026-10-27-first', '2026-10-28-second'];

describeTenantStore('perOrganization', async () => {
	const modules = testModules(IDS);
	const core = await openModuleCore(modules);
	const store = perOrganization({
		core,
		registry: mongoRegistry(core),
		database: unique('org_'),
		configure: await moduleWiring(modules),
		membership: async () => true as const,
		modules,
	});
	return {
		store,
		migrationIds: IDS,
		sharedDatabase: false,
		requestFor: (tenant) =>
			new Request('http://localhost/', {
				headers: { [store.header]: tenant.slug },
			}),
	};
});

describeTenantStore('single', async () => {
	const modules = testModules(IDS);
	const store = single({
		mongo: await openModuleSingle(modules),
		tenant: { id: 'only', slug: 'only', name: 'Only' },
		modules,
	});
	return {
		store,
		migrationIds: IDS,
		sharedDatabase: true,
		requestFor: () => new Request('http://localhost/'),
	};
});
