<template>
  <div class="min-h-screen bg-primary-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-sm">
      <div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-primary-900">Reset your password</h2>
        <p class="mt-2 text-center text-sm text-primary-600">
          Remembered it after all?
          <NuxtLink to="/auth/login" class="font-medium text-primary-600 hover:text-primary-500">
            Sign in
          </NuxtLink>
        </p>
      </div>

      <div v-if="submitted" class="rounded-lg bg-green-50 text-green-800 p-4 text-sm">
        If that email is registered, a password reset link has been sent to it. Check your inbox.
      </div>

      <form v-else class="mt-8 space-y-6" @submit.prevent="handleSubmit">
        <div>
          <label for="email" class="sr-only">Email address</label>
          <input
            id="email"
            v-model="email"
            name="email"
            type="email"
            required
            class="appearance-none rounded-lg relative block w-full px-3 py-2 border border-primary-300 placeholder-primary-500 text-primary-900 focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
            placeholder="Email address"
            :disabled="auth.loading"
          />
        </div>

        <button
          type="submit"
          class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
          :disabled="auth.loading"
        >
          {{ auth.loading ? 'Sending...' : 'Send reset link' }}
        </button>

        <div v-if="auth.error" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
          {{ auth.error.message }}
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
const auth = useAuthStore();

const email = ref('');
const submitted = ref(false);

async function handleSubmit() {
  try {
    await auth.forgotPassword(email.value);
    // Always shown on success, regardless of whether the email actually
    // matched an account - the backend deliberately never reveals that.
    submitted.value = true;
  } catch (error) {
    // Error is handled by the store
  }
}
</script>
