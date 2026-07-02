export default defineNuxtRouteMiddleware((to) => {
  // Auth state only ever exists client-side (restored from localStorage by
  // the auth plugin) - there is no server-side session/cookie. Enforcing
  // this during SSR would redirect every direct load/hard-refresh of a
  // protected route to /auth/login regardless of whether the browser
  // actually holds a valid token, since the server can never see it.
  // Protected data calls still 401 (and useApi() redirects to login on a
  // failed refresh) if the client genuinely has no valid session, so this
  // is a UX nicety, not the security boundary - the backend enforces that.
  if (import.meta.server) return;

  const auth = useAuthStore();

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return navigateTo('/auth/login');
  }

  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return navigateTo('/');
  }
});