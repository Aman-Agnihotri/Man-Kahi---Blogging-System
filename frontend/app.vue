<template>
  <div class="min-h-screen bg-primary-50">
    <TheHeader />
    <main>
      <NuxtPage />
    </main>
    <TheFooter />
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
</script>