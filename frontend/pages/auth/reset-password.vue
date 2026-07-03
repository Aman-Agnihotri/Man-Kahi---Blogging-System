<template>
  <div class="min-h-screen bg-primary-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-sm">
      <div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-primary-900">Choose a new password</h2>
      </div>

      <div v-if="!token" class="rounded-lg bg-red-50 text-red-700 p-4 text-sm">
        This reset link is missing its token. Request a new one from the
        <NuxtLink to="/auth/forgot-password" class="font-medium underline">forgot password page</NuxtLink>.
      </div>

      <div v-else-if="submitted" class="rounded-lg bg-green-50 text-green-800 p-4 text-sm space-y-3">
        <p>Your password has been reset.</p>
        <NuxtLink to="/auth/login" class="font-medium text-primary-600 hover:text-primary-500">
          Sign in with your new password
        </NuxtLink>
      </div>

      <form v-else class="mt-8 space-y-6" @submit.prevent="handleSubmit">
        <div>
          <label for="newPassword" class="sr-only">New password</label>
          <input
            id="newPassword"
            v-model="newPassword"
            name="newPassword"
            type="password"
            required
            class="appearance-none rounded-lg relative block w-full px-3 py-2 border border-primary-300 placeholder-primary-500 text-primary-900 focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
            placeholder="New password"
            :disabled="auth.loading"
          />
          <p class="mt-2 text-xs text-primary-500">
            Must be at least 8 characters and contain uppercase, lowercase, and a number.
          </p>
        </div>

        <button
          type="submit"
          class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
          :disabled="auth.loading"
        >
          {{ auth.loading ? 'Resetting...' : 'Reset password' }}
        </button>

        <div v-if="auth.error" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
          {{ auth.error.message }}
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const auth = useAuthStore();

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''));
const newPassword = ref('');
const submitted = ref(false);

async function handleSubmit() {
  try {
    await auth.resetPassword(token.value, newPassword.value);
    submitted.value = true;
  } catch (error) {
    // Error is handled by the store
  }
}
</script>
