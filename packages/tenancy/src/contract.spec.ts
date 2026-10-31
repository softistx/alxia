import { describeTenantStore, markers } from '../test/contract';
import {
	mongoRegistry,
	openCore,
	openTenantDb,
	tenantWiring,
	unique,
} from '../test/harness';
import { perOrganization, single } from '.';

const IDS: [string, string] = ['2026-10-27-first', '2026-10-28-second'];

describeTenantStore('perOrganization', async () => {
	const core = await openCore();
	const prefix = unique('org_');
	const store = perOrganization({
		core,
		registry: mongoRegistry(core),
		database: prefix,
		configure: await tenantWiring(),
		membership: async () => true as const,
		migrations: markers(...IDS),
	});
	return {
		store,
		migrationIds: IDS,
		requestFor: (tenant) =>
			new Request('http://localhost/', {
				headers: { [store.header]: tenant.slug },
			}),
	};
});

describeTenantStore('single', async () => {
	const mongo = await openTenantDb();
	const store = single({
		mongo,
		tenant: { id: 'only', slug: 'only', name: 'Only' },
		migrations: markers(...IDS),
	});
	return {
		store,
		migrationIds: IDS,
		requestFor: () => new Request('http://localhost/'),
	};
});
