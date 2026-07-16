<template>
  <div class="min-h-screen bg-primary-50">
    <div class="max-w-4xl mx-auto px-4 py-12">
      <h1 class="text-3xl font-bold text-primary-900 mb-8">Settings</h1>

      <div v-if="error" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
        {{ error }}
      </div>

      <div class="bg-white rounded-xl shadow-sm p-8">
        <div v-if="loading" class="space-y-6">
          <div class="h-24 w-24 rounded-full bg-primary-100 animate-pulse"></div>
          <div class="h-10 w-full bg-primary-100 animate-pulse rounded"></div>
          <div class="h-24 w-full bg-primary-100 animate-pulse rounded"></div>
        </div>

        <template v-else>
          <div class="flex items-center space-x-8 mb-8">
            <div class="relative">
              <img
                v-if="avatarUrl"
                :src="avatarUrl"
                :alt="auth.user?.username"
                class="w-24 h-24 rounded-full object-cover border-4 border-primary-200"
              >
              <span
                v-else
                class="w-24 h-24 rounded-full border-4 border-primary-200 bg-primary-100 text-primary-700 flex items-center justify-center text-3xl font-semibold uppercase"
              >
                {{ auth.user?.username?.charAt(0) }}
              </span>

              <label
                for="avatar-upload"
                class="absolute bottom-0 right-0 w-8 h-8 flex items-center justify-center bg-primary-600 text-white rounded-full cursor-pointer hover:bg-primary-700"
                :class="{ 'opacity-50 pointer-events-none': avatarUploading }"
                title="Change avatar"
                aria-label="Change avatar"
              >
                <i class="ri-camera-line text-sm" aria-hidden="true"></i>
              </label>
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                class="hidden"
                :disabled="avatarUploading"
                @change="handleAvatarChange"
              >
            </div>
            <p v-if="avatarUploading" class="text-sm text-primary-500">Uploading...</p>
            <p v-else-if="avatarError" class="text-sm text-red-600">{{ avatarError }}</p>
          </div>

          <form @submit.prevent="saveSettings" class="space-y-6">
            <div>
              <label for="settings-username" class="block text-sm font-medium text-primary-700 mb-2">
                Username
              </label>
              <input
                id="settings-username"
                :value="auth.user?.username"
                type="text"
                disabled
                class="w-full rounded-lg border-primary-200 bg-primary-50 text-primary-500 cursor-not-allowed"
              >
            </div>

            <div>
              <label for="settings-email" class="block text-sm font-medium text-primary-700 mb-2">
                Email
              </label>
              <input
                id="settings-email"
                :value="auth.user?.email"
                type="email"
                disabled
                class="w-full rounded-lg border-primary-200 bg-primary-50 text-primary-500 cursor-not-allowed"
              >
            </div>

            <div>
              <label for="settings-bio" class="block text-sm font-medium text-primary-700 mb-2">
                Bio
              </label>
              <textarea
                id="settings-bio"
                v-model="profile.bio"
                rows="4"
                placeholder="Tell readers a little about yourself"
                class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
              ></textarea>
            </div>

            <div>
              <label for="settings-website" class="block text-sm font-medium text-primary-700 mb-2">
                Website
              </label>
              <input
                id="settings-website"
                v-model="profile.website"
                type="url"
                placeholder="https://your-site.com"
                class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
              >
            </div>

            <div>
              <label for="settings-twitter" class="block text-sm font-medium text-primary-700 mb-2">
                Twitter
              </label>
              <input
                id="settings-twitter"
                v-model="profile.twitter"
                type="url"
                placeholder="https://twitter.com/yourhandle"
                class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
              >
            </div>

            <div>
              <label for="settings-github" class="block text-sm font-medium text-primary-700 mb-2">
                GitHub
              </label>
              <input
                id="settings-github"
                v-model="profile.github"
                type="url"
                placeholder="https://github.com/yourhandle"
                class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
              >
            </div>

            <div>
              <label for="settings-linkedin" class="block text-sm font-medium text-primary-700 mb-2">
                LinkedIn
              </label>
              <input
                id="settings-linkedin"
                v-model="profile.linkedin"
                type="url"
                placeholder="https://linkedin.com/in/yourhandle"
                class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
              >
            </div>

            <div class="pt-6 border-t border-primary-200 space-y-3">
              <button
                type="submit"
                :disabled="saving"
                class="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {{ saving ? 'Saving...' : 'Save Changes' }}
              </button>
              <p v-if="saveMessage" class="bg-primary-50 text-primary-700 p-3 rounded-lg text-sm">
                {{ saveMessage }}
              </p>
              <p v-if="saveError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
                {{ saveError }}
              </p>
            </div>
          </form>
        </template>
      </div>

      <div class="mt-8 bg-white rounded-xl shadow-sm p-8">
        <h2 class="text-xl font-bold text-primary-900 mb-6">Notification Preferences</h2>

        <div v-if="notifLoading" class="space-y-4">
          <div class="h-6 w-full bg-primary-100 animate-pulse rounded"></div>
          <div class="h-6 w-full bg-primary-100 animate-pulse rounded"></div>
          <div class="h-6 w-full bg-primary-100 animate-pulse rounded"></div>
        </div>

        <div v-else class="space-y-4">
          <label class="flex items-center justify-between">
            <span class="text-primary-700">Email me when someone comments on my stories</span>
            <input
              v-model="notifPrefs.emailOnComment"
              type="checkbox"
              class="w-5 h-5 rounded border-primary-300 text-primary-600 focus:ring-primary-500"
            >
          </label>
          <label class="flex items-center justify-between">
            <span class="text-primary-700">Email me when someone follows me</span>
            <input
              v-model="notifPrefs.emailOnFollow"
              type="checkbox"
              class="w-5 h-5 rounded border-primary-300 text-primary-600 focus:ring-primary-500"
            >
          </label>
          <label class="flex items-center justify-between">
            <span class="text-primary-700">Email me when someone likes my stories</span>
            <input
              v-model="notifPrefs.emailOnLike"
              type="checkbox"
              class="w-5 h-5 rounded border-primary-300 text-primary-600 focus:ring-primary-500"
            >
          </label>

          <div class="pt-6 border-t border-primary-200 space-y-3">
            <button
              :disabled="notifSaving"
              class="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              @click="saveNotifPrefs"
            >
              {{ notifSaving ? 'Saving...' : 'Save Preferences' }}
            </button>
            <p v-if="notifMessage" class="bg-primary-50 text-primary-700 p-3 rounded-lg text-sm">
              {{ notifMessage }}
            </p>
            <p v-if="notifError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
              {{ notifError }}
            </p>
          </div>
        </div>
      </div>

      <div class="mt-8 bg-white rounded-xl shadow-sm p-8">
        <h2 class="text-xl font-bold text-primary-900 mb-6">Connected Accounts</h2>
        <button
          type="button"
          @click="handleLinkGoogle"
          class="w-full flex justify-center items-center space-x-2 py-2 px-4 border border-primary-300 text-sm font-medium rounded-md text-primary-700 bg-white hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
        >
          <i class="ri-google-fill text-lg"></i>
          <span>Link Google</span>
        </button>
      </div>

      <div class="mt-8 bg-white rounded-xl shadow-sm p-8">
        <h2 class="text-xl font-bold text-red-600 mb-6">Danger Zone</h2>
        <button
          @click="handleSignOut"
          class="px-6 py-2 border-2 border-red-600 text-red-600 rounded-lg hover:bg-red-50"
        >
          Sign Out
        </button>

        <div class="mt-6 pt-6 border-t border-primary-200">
          <p class="text-sm text-primary-600 mb-4">
            Deleting your account is permanent and cannot be undone.
          </p>

          <button
            v-if="!showDeleteConfirm"
            @click="revealDeleteConfirm"
            class="px-6 py-2 border-2 border-red-600 text-red-600 rounded-lg hover:bg-red-50"
          >
            Delete Account
          </button>

          <div v-else class="space-y-4 max-w-sm">
            <div>
              <label for="delete-password" class="block text-sm font-medium text-primary-700 mb-2">
                Enter your password to confirm
              </label>
              <input
                id="delete-password"
                v-model="deletePassword"
                type="password"
                autocomplete="current-password"
                class="w-full rounded-lg border-primary-200 focus:border-red-500 focus:ring-red-500"
              >
            </div>

            <p v-if="deleteError" class="text-sm text-red-600">{{ deleteError }}</p>

            <div class="flex items-center space-x-3">
              <button
                :disabled="deleteLoading"
                class="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                @click="confirmDeleteAccount"
              >
                {{ deleteLoading ? 'Deleting...' : 'Permanently Delete Account' }}
              </button>
              <button
                :disabled="deleteLoading"
                class="px-6 py-2 border-2 border-primary-200 text-primary-600 rounded-lg hover:bg-primary-50 disabled:opacity-50"
                @click="cancelDelete"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NotificationPrefs, SocialLinks } from '~/types/auth';
import type { ApiError } from '~/types/admin';

definePageMeta({ requiresAuth: true });

const auth = useAuthStore();
const profileApi = useProfileApi();
const route = useRoute();

// --- Profile form --------------------------------------------------------

const loading = ref(true);
const error = ref<string | null>(null);

const profile = ref({
  bio: '',
  website: '',
  twitter: '',
  github: '',
  linkedin: '',
});

const avatarUrl = ref<string | null>(null);
const avatarUploading = ref(false);
const avatarError = ref<string | null>(null);

const saving = ref(false);
const saveMessage = ref<string | null>(null);
const saveError = ref<string | null>(null);

async function loadProfile() {
  loading.value = true;
  error.value = null;
  try {
    const data = await profileApi.getProfile();
    profile.value.bio = data.bio ?? '';
    profile.value.website = data.socialLinks?.website ?? '';
    profile.value.twitter = data.socialLinks?.twitter ?? '';
    profile.value.github = data.socialLinks?.github ?? '';
    profile.value.linkedin = data.socialLinks?.linkedin ?? '';
    avatarUrl.value = data.profileImage;
  } catch (err) {
    error.value = (err as ApiError)?.message ?? 'Failed to load your profile.';
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  saving.value = true;
  saveMessage.value = null;
  saveError.value = null;
  try {
    const socialLinks: SocialLinks = {};
    if (profile.value.website.trim()) socialLinks.website = profile.value.website.trim();
    if (profile.value.twitter.trim()) socialLinks.twitter = profile.value.twitter.trim();
    if (profile.value.github.trim()) socialLinks.github = profile.value.github.trim();
    if (profile.value.linkedin.trim()) socialLinks.linkedin = profile.value.linkedin.trim();

    await profileApi.updateProfile({ bio: profile.value.bio, socialLinks });
    saveMessage.value = 'Your profile has been updated.';
  } catch (err) {
    saveError.value = (err as ApiError)?.message ?? 'Failed to save your changes.';
  } finally {
    saving.value = false;
  }
}

async function handleAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  avatarUploading.value = true;
  avatarError.value = null;
  try {
    const result = await profileApi.uploadAvatar(file);
    avatarUrl.value = result.profileImage;
  } catch (err) {
    avatarError.value = (err as ApiError)?.message ?? 'Failed to upload avatar.';
  } finally {
    avatarUploading.value = false;
    input.value = '';
  }
}

// --- Notification preferences --------------------------------------------

const notifLoading = ref(true);
const notifSaving = ref(false);
const notifMessage = ref<string | null>(null);
const notifError = ref<string | null>(null);
const notifPrefs = ref<NotificationPrefs>({
  emailOnComment: false,
  emailOnFollow: false,
  emailOnLike: false,
});

async function loadNotificationPrefs() {
  notifLoading.value = true;
  try {
    notifPrefs.value = await profileApi.getNotificationPrefs();
  } catch (err) {
    notifError.value = (err as ApiError)?.message ?? 'Failed to load notification preferences.';
  } finally {
    notifLoading.value = false;
  }
}

async function saveNotifPrefs() {
  notifSaving.value = true;
  notifMessage.value = null;
  notifError.value = null;
  try {
    notifPrefs.value = await profileApi.updateNotificationPrefs(notifPrefs.value);
    notifMessage.value = 'Notification preferences saved.';
  } catch (err) {
    notifError.value = (err as ApiError)?.message ?? 'Failed to save notification preferences.';
  } finally {
    notifSaving.value = false;
  }
}

// --- Danger zone -----------------------------------------------------------

const showDeleteConfirm = ref(false);
const deletePassword = ref('');
const deleteLoading = ref(false);
const deleteError = ref<string | null>(null);

function revealDeleteConfirm() {
  showDeleteConfirm.value = true;
  deleteError.value = null;
  deletePassword.value = '';
}

function cancelDelete() {
  showDeleteConfirm.value = false;
  deletePassword.value = '';
  deleteError.value = null;
}

async function confirmDeleteAccount() {
  if (!deletePassword.value) {
    deleteError.value = 'Please enter your password to confirm.';
    return;
  }

  deleteLoading.value = true;
  deleteError.value = null;
  try {
    await profileApi.deleteAccount(deletePassword.value);
    // deleteAccount already blacklists the token server-side, so a full
    // logout() round-trip would just 401 harmlessly - clear local state directly.
    auth.clearAuthData();
    await navigateTo('/');
  } catch (err) {
    const apiErr = err as ApiError;
    if (apiErr?.status === 401) {
      deleteError.value = 'Incorrect password. Please try again.';
    } else {
      deleteError.value = apiErr?.message ?? 'Failed to delete your account.';
    }
  } finally {
    deleteLoading.value = false;
  }
}

const handleSignOut = async () => {
  await auth.logout();
  await navigateTo('/');
};

// --- Connected accounts ----------------------------------------------------

async function handleLinkGoogle() {
  try {
    await auth.linkWithGoogle();
  } catch (err) {
    error.value = (err as ApiError)?.message ?? 'Failed to link Google account.';
  }
}

onMounted(() => {
  loadProfile();
  loadNotificationPrefs();
  if (route.query.linkError) error.value = String(route.query.linkError);
});
</script>
