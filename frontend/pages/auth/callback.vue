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
    const code = String(route.query.error);

    const loginErrorMessages: Record<string, string> = {
      email_exists: 'This email is already registered. Sign in with your password, then link Google in settings.',
      email_missing: "Google didn't share an email address for that account, so we can't sign you in. Try a different Google account.",
      oauth_failed: 'Something went wrong signing in with Google. Please try again.',
      user_not_found: "We couldn't find your account. Please sign in again, then retry linking Google.",
    };

    const settingsErrorMessages: Record<string, string> = {
      provider_already_linked: 'Your Google account is already linked to this profile.',
      email_mismatch: "That Google account's email doesn't match your ManKahi email. Link a Google account that uses the same email.",
      invalid_link_token: 'Your linking session expired. Please try linking Google again.',
    };

    if (code in settingsErrorMessages) {
      router.replace('/user/settings?linkError=' + encodeURIComponent(settingsErrorMessages[code]));
      return;
    }

    const message = loginErrorMessages[code] ?? loginErrorMessages.oauth_failed;
    auth.error = { message, code: 'OAUTH_ERROR' };
    router.replace('/auth/login');
    return;
  }
  const ok = await auth.refreshSession();
  if (ok && route.query.linked) {
    router.replace('/user/settings?linked=' + encodeURIComponent(String(route.query.linked)));
    return;
  }
  router.replace(ok ? '/user/dashboard' : '/auth/login');
});
</script>