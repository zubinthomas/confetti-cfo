/**
 * Minimal app params.
 * The access_token is read directly from localStorage by the API client.
 */

export const appParams = {
  // Read token from localStorage (written there after login / OAuth callback)
  get token() {
    return localStorage.getItem('access_token');
  },
};
