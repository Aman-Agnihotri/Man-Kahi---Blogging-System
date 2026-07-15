<template>
  <div class="min-h-screen bg-primary-50 flex items-center justify-center">
    <div class="bg-white p-8 rounded-xl shadow-sm">
      <p class="text-primary-600">Processing authentication...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

onMounted(async () => {
  // The OAuth callback redirect no longer carries tokens as query params -
  // the backend sets an HttpOnly refresh_token cookie. refreshSession()
  // exchanges that cookie server-side for a full session (tokens + user)
  // via /api/auth/refresh.
  if (route.query.error) {
    router.replace('/auth/login');
    return;
  }
  const ok = await auth.refreshSession();
  router.replace(ok ? '/user/dashboard' : '/auth/login');
});
</script>