export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore();
  
  // Check if the route requires authentication
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return navigateTo('/auth/login');
  }

  // Check if the route requires admin role
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return navigateTo('/');
  }
});