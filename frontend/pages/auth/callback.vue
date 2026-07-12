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
  // The OAuth callback redirect delivers tokens as query params; seed the
  // store's refreshToken and let refreshSession() exchange it server-side
  // for a full session (tokens + user) via /api/auth/refresh.
  if (route.query.error) {
    router.replace('/auth/login');
    return;
  }
  const refreshToken = route.query.refreshToken;
  if (typeof refreshToken === 'string' && refreshToken) {
    auth.refreshToken = refreshToken;
  }
  const ok = await auth.refreshSession();
  router.replace(ok ? '/user/dashboard' : '/auth/login');
});
</script>