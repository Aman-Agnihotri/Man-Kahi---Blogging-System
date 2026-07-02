<template>
  <div>
    <NuxtLoadingIndicator color="#6366f1" :duration="3000" />
    <NuxtLayout />
  </div>
</template>

<script setup lang="ts">
  useHead({
    titleTemplate: (titleChunk) => {
      return titleChunk ? `${titleChunk} - ManKahi` : 'ManKahi - Share Your Stories'
    },
    link: [
      {
        rel: 'stylesheet',
        href: 'https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css'
      }
    ]
  })

  // Restore session from localStorage on boot. Done here (a real Vue
  // component, guaranteed full Pinia/Nuxt context) rather than in a
  // plugins/*.ts file - a plugin calling useAuthStore() threw
  // "getActivePinia() was called but there was no active Pinia" regardless
  // of enforce order or nuxtApp.runWithContext(), confirmed live.
  if (import.meta.client) {
    const auth = useAuthStore()
    auth.initAuth()
  }
</script>