import { useLocation, useNavigation } from 'react-router';

/**
 * `true` while a navigation is loading and goes to the pathname the page is
 * on: another search of this list, not another page. It stays `false` for a
 * navigation elsewhere (and when idle), so a list can show its skeleton
 * without flashing on a click that leaves it.
 */
export function useSameRouteLoading(): boolean {
	const navigation = useNavigation();
	const { pathname } = useLocation();
	return (
		navigation.state === 'loading' && navigation.location.pathname === pathname
	);
}
