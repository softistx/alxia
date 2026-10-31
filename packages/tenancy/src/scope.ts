import type {
	Membership,
	Tenant,
	TenantScope,
	TenantStore,
	Viewer,
} from './types';

/**
 * The scope of ONE request, resolved on first use and then kept: a request
 * that never asks (sign-in, a link) never reads the header, the registry or the
 * membership. The refusals are kept as well, so every guard of a request
 * answers the same.
 */
export function lazyScope<C, K, T extends Tenant, M>(
	store: Pick<TenantStore<C, K, T, M>, 'scope'>,
	request: Request,
	viewer: Viewer | null,
): () => Promise<TenantScope<C, K, T, M>> {
	let scope: Promise<TenantScope<C, K, T, M>> | undefined;
	return () => {
		scope ??= store.scope(request, viewer);
		return scope;
	};
}

/** The viewer's membership in ANY tenant, read once per request and kept. */
export interface ViewerMemberships<M> {
	in(tenantId: string): Promise<M | null>;
	/** Records a membership already in hand. */
	prime(tenantId: string, member: M): void;
}

/**
 * Several tenants in one response (a list of the viewer's organisations) read
 * each membership once. Never shared across requests.
 */
export function viewerMemberships<M>(
	membership: Membership<M>,
	viewer: Viewer | null,
): ViewerMemberships<M> {
	const known = new Map<string, Promise<M | null>>();
	return {
		in(tenantId) {
			if (!viewer) return Promise.resolve(null);
			let member = known.get(tenantId);
			if (!member) {
				const read = membership(tenantId, viewer.id).then((m) =>
					m === false ? null : m,
				);
				member = read;
				known.set(tenantId, read);
				// A failed read is forgotten, so a later field in the request tries again.
				read.catch(() => {
					if (known.get(tenantId) === read) known.delete(tenantId);
				});
			}
			return member;
		},
		prime(tenantId, member) {
			known.set(tenantId, Promise.resolve(member));
		},
	};
}
