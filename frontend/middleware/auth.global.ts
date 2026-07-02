export default defineNuxtRouteMiddleware(async (to) => {
  // Auth state only ever exists client-side (restored from localStorage) -
  // there is no server-side session/cookie. Enforcing this during SSR
  // would redirect every direct load/hard-refresh of a protected route to
  // /auth/login regardless of whether the browser actually holds a valid
  // token, since the server can never see it. Protected data calls still
  // 401 (and useApi() redirects to login on a failed refresh) if the
  // client genuinely has no valid session, so this is a UX nicety, not the
  // security boundary - the backend enforces that.
  if (import.meta.server) return;

  const auth = useAuthStore();

  // Await session restoration HERE, not in a plugin/app.vue and hoping it
  // finishes first. Confirmed live: a plugin calling useAuthStore() crashes
  // ("no active Pinia" - some Vite-dev-mode dual-package/context quirk,
  // not an enforce-order issue), and even an awaited top-level await in
  // app.vue's <script setup> does NOT gate the router's first navigation -
  // this middleware ran and redirected to /auth/login while the
  // in-flight /api/auth/refresh call from app.vue was still pending,
  // confirmed via the network log. initAuth() is idempotent (an
  // `initialized` guard), so awaiting it here on every navigation is cheap
  // after the first call and guarantees correct ordering by construction.
  await auth.initAuth();

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return navigateTo('/auth/login');
  }

  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return navigateTo('/');
  }
});
