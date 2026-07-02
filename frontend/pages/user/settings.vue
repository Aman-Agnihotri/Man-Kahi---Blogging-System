<template>
  <div class="min-h-screen bg-primary-50">
    <div class="max-w-4xl mx-auto px-4 py-12">
      <h1 class="text-3xl font-bold text-primary-900 mb-8">Settings</h1>

      <div class="bg-white rounded-xl shadow-sm p-8">
        <div class="flex items-center space-x-8 mb-8">
          <span
            class="w-24 h-24 rounded-full border-4 border-primary-200 bg-primary-100 text-primary-700 flex items-center justify-center text-3xl font-semibold uppercase"
          >
            {{ auth.user?.username?.charAt(0) }}
          </span>
        </div>

        <form @submit.prevent="saveSettings" class="space-y-6">
          <div>
            <label class="block text-sm font-medium text-primary-700 mb-2">
              Username
            </label>
            <input
              :value="auth.user?.username"
              type="text"
              disabled
              class="w-full rounded-lg border-primary-200 bg-primary-50 text-primary-500 cursor-not-allowed"
            >
          </div>

          <div>
            <label class="block text-sm font-medium text-primary-700 mb-2">
              Email
            </label>
            <input
              :value="auth.user?.email"
              type="email"
              disabled
              class="w-full rounded-lg border-primary-200 bg-primary-50 text-primary-500 cursor-not-allowed"
            >
          </div>

          <div>
            <label class="block text-sm font-medium text-primary-700 mb-2">
              Bio
            </label>
            <textarea
              v-model="profile.bio"
              rows="4"
              placeholder="Not available yet"
              class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-primary-700 mb-2">
              Website
            </label>
            <input
              v-model="profile.website"
              type="url"
              placeholder="Not available yet"
              class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
            >
          </div>

          <div class="pt-6 border-t border-primary-200 space-y-3">
            <button
              type="submit"
              class="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Save Changes
            </button>
            <p v-if="saveMessage" class="bg-primary-50 text-primary-700 p-3 rounded-lg text-sm">
              {{ saveMessage }}
            </p>
          </div>
        </form>
      </div>

      <div class="mt-8 bg-white rounded-xl shadow-sm p-8">
        <h2 class="text-xl font-bold text-red-600 mb-6">Danger Zone</h2>
        <button
          @click="handleSignOut"
          class="px-6 py-2 border-2 border-red-600 text-red-600 rounded-lg hover:bg-red-50"
        >
          Sign Out
        </button>
        <p class="mt-3 text-sm text-primary-500">
          Account deletion isn't available yet. You can sign out of your account above.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ requiresAuth: true });

const auth = useAuthStore();

// Bio/website have no backing API - kept as inert local fields so the form
// layout isn't stripped, but nothing is persisted (see saveSettings below).
const profile = ref({
  bio: '',
  website: '',
});

const saveMessage = ref<string | null>(null);

const saveSettings = () => {
  saveMessage.value = "Profile editing isn't available yet.";
};

const handleSignOut = async () => {
  await auth.logout();
  await navigateTo('/');
};
</script>
