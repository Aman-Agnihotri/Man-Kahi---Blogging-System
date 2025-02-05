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

onMounted(async () => {
  try {
    await auth.refreshSession();
    router.push('/user/dashboard');
  } catch (error) {
    router.push('/auth/login');
  }
});
</script>