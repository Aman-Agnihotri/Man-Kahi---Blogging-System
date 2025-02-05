<template>
  <div class="min-h-screen bg-primary-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-sm">
      <div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-primary-900">Create your account</h2>
        <p class="mt-2 text-center text-sm text-primary-600">
          Already have an account?
          <NuxtLink to="/auth/login" class="font-medium text-primary-600 hover:text-primary-500">
            Sign in
          </NuxtLink>
        </p>
      </div>

      <form class="mt-8 space-y-6" @submit.prevent="handleRegister">
        <div class="rounded-md shadow-sm space-y-4">
          <div>
            <label for="username" class="sr-only">Username</label>
            <input
              id="username"
              v-model="username"
              name="username"
              type="text"
              required
              class="appearance-none rounded-lg relative block w-full px-3 py-2 border border-primary-300 placeholder-primary-500 text-primary-900 focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
              placeholder="Username"
              :disabled="auth.loading"
            />
          </div>
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
            <p class="mt-1 text-sm text-primary-500">
              Password must be at least 8 characters and contain uppercase, lowercase, and numbers
            </p>
          </div>
        </div>

        <div class="space-y-3">
          <button
            type="submit"
            class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
            :disabled="auth.loading"
          >
            {{ auth.loading ? 'Creating account...' : 'Create account' }}
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

const username = ref('');
const email = ref('');
const password = ref('');

async function handleRegister() {
  try {
    await auth.register({
      username: username.value,
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