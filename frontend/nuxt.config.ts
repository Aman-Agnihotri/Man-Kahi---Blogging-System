// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  future: {
    compatibilityVersion: 4,
  },
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/tailwindcss',
    '@vueuse/nuxt'
  ],
  app: {
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
      siteUrl: process.env.SITE_URL ?? 'http://localhost:3000'
    }
  }
})