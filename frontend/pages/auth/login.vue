<template>
  <div class="min-h-screen bg-primary-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-sm">
      <div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-primary-900">Sign in to ManKahi</h2>
        <p class="mt-2 text-center text-sm text-primary-600">
          Or
          <NuxtLink to="/auth/register" class="font-medium text-primary-600 hover:text-primary-500">
            create a new account
          </NuxtLink>
        </p>
      </div>

      <form class="mt-8 space-y-6" @submit.prevent="handleLogin">
        <div class="rounded-md shadow-sm space-y-4">
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
          <div>
            <label for="password" class="sr-only">Password</label>
            <input
              id="password"
              v-model="password"
              name="password"
              type="password"
              required
              class="appearance-none rounded-lg relative block w-full px-3 py-2 border border-primary-300 placeholder-primary-500 text-primary-900 focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
              placeholder="Password"
              :disabled="auth.loading"
            />
          </div>
        </div>

        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <input
              id="remember-me"
              name="remember-me"
              type="checkbox"
              class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-primary-300 rounded"
            />
            <label for="remember-me" class="ml-2 block text-sm text-primary-900">
              Remember me
            </label>
          </div>

          <div class="text-sm">
            <a href="#" class="font-medium text-primary-600 hover:text-primary-500">
              Forgot your password?
            </a>
          </div>
        </div>

        <div class="space-y-3">
          <button
            type="submit"
            class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
            :disabled="auth.loading"
          >
            {{ auth.loading ? 'Signing in...' : 'Sign in' }}
          </button>

          <button
            type="button"
            @click="handleGoogleLogin"
            class="w-full flex justify-center items-center space-x-2 py-2 px-4 border border-primary-300 text-sm font-medium rounded-md text-primary-700 bg-white hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
            :disabled="auth.loading"
          >
            <i class="ri-google-fill text-lg"></i>
            <span>Continue with Google</span>
          </button>
        </div>

        <div v-if="auth.error" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
          {{ auth.error.message }}
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();
const auth = useAuthStore();

const email = ref('');
const password = ref('');

async function handleLogin() {
  try {
    await auth.login({
      email: email.value,
      password: password.value
    });
    router.push('/user/dashboard');
  } catch (error) {
    // Error is handled by the store
  }
}

async function handleGoogleLogin() {
  try {
    await auth.loginWithGoogle();
  } catch (error) {
    // Error is handled by the store
  }
}
</script>