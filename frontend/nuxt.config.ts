// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  future: {
    compatibilityVersion: 4,
  },
  devtools: { enabled: true },
  pages: true,
  modules: [
    '@nuxtjs/tailwindcss',
    '@vueuse/nuxt',
    '@pinia/nuxt'
  ],
  app: {
    pageTransition: false,
    layoutTransition: false,
    head: {
      title: 'ManKahi - Share Your Stories',
      link: [{ rel: 'icon', type: 'image/png', href: '/favicon.png' }],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { 
          hid: 'description', 
          name: 'description', 
          content: 'ManKahi - A modern publishing platform for writers and readers' 
        }
      ]
    }
  },
  runtimeConfig: {
    public: {
      siteUrl: process.env.SITE_URL ?? 'http://localhost:3000',
      // Base URL of the nginx gateway that fronts every backend service.
      // NUXT_PUBLIC_API_URL is already set by docker-compose.yml; this key
      // name (apiUrl) is what Nuxt auto-maps that env var onto.
      apiUrl: process.env.NUXT_PUBLIC_API_URL ?? 'http://localhost:8080'
    }
  }
})