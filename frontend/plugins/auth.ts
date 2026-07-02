export default defineNuxtPlugin({
  name: 'auth',
  enforce: 'pre',
  async setup() {
    // Restore session from localStorage on boot. Auth header injection and
    // 401-triggered refresh for regular API calls both live in useApi().
    if (import.meta.client) {
      const auth = useAuthStore();
      await auth.initAuth();
    }
  },
});
