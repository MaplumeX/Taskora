/**
 * Web navigation adapters for the shared auth flow.
 *
 * The core auth mutations live in `@taskora/api`; this module installs the
 * web router navigation callbacks (redirects to /today, /login, /register)
 * and re-exports the hooks so pages keep a single import site.
 */
import { setAuthFlowNavigation } from '@taskora/api';
import {
  useLogin as useLoginBase,
  useRegister as useRegisterBase,
  useLogout as useLogoutBase,
} from '@taskora/api';

/** sessionStorage flag set right before the post-register redirect. */
export const REGISTERED_FLAG = 'taskora-registered';

setAuthFlowNavigation({
  afterLogin: () => window.location.assign('/today'),
  afterRegister: () => {
    // Full-page navigation follows, so a toast would be torn down before
    // painting. Leave a flag for the login page to show the success message.
    try {
      window.sessionStorage.setItem(REGISTERED_FLAG, '1');
    } catch {
      // storage unavailable — skip the notice, the redirect still works
    }
    window.location.assign('/login');
  },
  onLoggedOut: () => {
    if (window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
  },
});

export const authKeys = { me: ['auth', 'me'] as const };
export { useCurrentUser } from '@taskora/api';

export function useLogin() {
  return useLoginBase();
}

export function useRegister() {
  return useRegisterBase();
}

export function useLogout() {
  return useLogoutBase();
}
