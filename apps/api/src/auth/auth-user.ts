/**
 * What the rest of the app knows about the logged-in user: attached to
 * `request.user` by the Passport strategies. Never contains the password hash.
 */
export interface AuthUser {
  id: string;
  email: string;
}

/** Claims we put in the JWT. `sub` (subject) is the standard claim for the user id. */
export interface JwtPayload {
  sub: string;
  email: string;
}
