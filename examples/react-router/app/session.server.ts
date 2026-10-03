// Sessions in memory, keyed by the `sid` cookie. Anyone may sign in by
// name: there is no real authentication here, only where it plugs in.
export interface User {
  readonly name: string;
}

const COOKIE = "sid";
const sessions = new Map<string, User>();

/** The user of the request's session, or null. */
export function userOf(request: Request): User | null {
  // A hook reads the Cookie header itself: only a route handler gets the
  // cookies parsed, as ctx.cookies.
  const cookies = new Bun.CookieMap(request.headers.get("cookie") ?? "");
  const id = cookies.get(COOKIE);
  return id === null ? null : (sessions.get(id) ?? null);
}

/** Opens a session for `user`, and returns the Set-Cookie that carries it. */
export function signIn(user: User): string {
  const id = crypto.randomUUID();
  sessions.set(id, user);
  return new Bun.Cookie(COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  }).serialize();
}
