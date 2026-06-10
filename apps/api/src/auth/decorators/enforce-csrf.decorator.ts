import { SetMetadata } from "@nestjs/common";

export const CSRF_REQUIRED_KEY = "auth:csrfRequired";

/**
 * Force the double-submit CSRF check even on an @Public() route.
 *
 * Needed for /auth/refresh: it must be JWT-public (the access token is
 * expired by the time a client refreshes), yet it is a state-changing,
 * cookie-authenticated request and so still requires the CSRF token. Without
 * this marker CsrfGuard short-circuits on @Public() and the refresh endpoint
 * accepts forged cross-site requests.
 */
export const EnforceCsrf = (): MethodDecorator & ClassDecorator =>
  SetMetadata(CSRF_REQUIRED_KEY, true);
