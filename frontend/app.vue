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

  // Session restoration lives in middleware/auth.global.ts (awaited there,
  // on every navigation, before it decides whether to redirect) - NOT
  // here. It's tempting to also do it here since app.vue is guaranteed
  // full Pinia/Nuxt context (unlike a plugins/*.ts file, which crashed
  // with "no active Pinia" - some Vite-dev-mode context quirk), but a
  // top-level await here does NOT gate the router's first navigation the
  // way it looks like it should: confirmed live, the global middleware
  // still ran and redirected before this component's await resolved.
</script>