<template>
  <footer class="bg-primary-800 text-white py-16">
    <div class="container mx-auto px-4">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
        <div>
          <h3 class="text-2xl font-bold mb-6">ManKahi</h3>
          <p class="text-primary-200 mb-6">
            Where stories find their voice. Join our community of writers and readers.
          </p>
          <div class="flex space-x-4">
            <a v-for="social in socialLinks" :key="social.name" :href="social.url" :aria-label="social.name"
              class="text-primary-200 hover:text-white transition-colors">
              <i :class="social.icon" class="text-xl"></i>
            </a>
          </div>
        </div>

        <div>
          <h4 class="text-lg font-semibold mb-4">Quick Links</h4>
          <ul class="space-y-3">
            <li v-for="link in quickLinks" :key="link.path">
              <NuxtLink :to="link.path" class="text-primary-200 hover:text-white transition-colors">
                {{ link.label }}
              </NuxtLink>
            </li>
          </ul>
        </div>

        <div>
          <h4 class="text-lg font-semibold mb-4">Resources</h4>
          <ul class="space-y-3">
            <li v-for="resource in resources" :key="resource.path">
              <NuxtLink :to="resource.path" class="text-primary-200 hover:text-white transition-colors">
                {{ resource.label }}
              </NuxtLink>
            </li>
          </ul>
        </div>

        <div>
          <h4 class="text-lg font-semibold mb-4">Subscribe to Our Newsletter</h4>
          <p class="text-primary-200 mb-4">
            Get the latest stories and updates delivered to your inbox.
          </p>
          <form @submit.prevent="handleSubscribe" class="space-y-3">
            <input type="email" v-model="email" placeholder="Enter your email"
              class="w-full px-4 py-2 rounded-lg bg-primary-700 text-white placeholder-primary-300 border border-primary-600 focus:outline-none focus:border-primary-400">
            <button type="submit"
              class="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors">
              Subscribe
            </button>
          </form>
        </div>
      </div>

      <div class="mt-12 pt-8 border-t border-primary-700">
        <div class="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          <p class="text-primary-200">
            &copy; {{ new Date().getFullYear() }} ManKahi. All rights reserved.
          </p>
          <div class="flex space-x-6">
            <NuxtLink v-for="link in legalLinks" :key="link.path" :to="link.path"
              class="text-primary-200 hover:text-white text-sm transition-colors">
              {{ link.label }}
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
  const email = ref('')

  const socialLinks = [
    { name: 'Twitter', icon: 'ri-twitter-fill', url: '#' },
    { name: 'GitHub', icon: 'ri-github-fill', url: '#' },
    { name: 'LinkedIn', icon: 'ri-linkedin-fill', url: '#' },
    { name: 'Instagram', icon: 'ri-instagram-fill', url: '#' }
  ]

  const quickLinks = [
    { label: 'Home', path: '/' },
    { label: 'Explore', path: '/content/explore' },
    { label: 'Categories', path: '/categories' },
    { label: 'About Us', path: '/docs/about' }
  ]

  const resources = [
    { label: 'Help Center', path: '/docs/help' },
    { label: 'Writing Guide', path: '/docs/guide' },
    { label: 'Community', path: '/docs/community' },
    { label: 'Contact Us', path: '/contact' }
  ]

  const legalLinks = [
    { label: 'Privacy Policy', path: '/docs/privacy' },
    { label: 'Terms of Service', path: '/docs/terms' },
    { label: 'Cookie Policy', path: '/docs/cookies' }
  ]

  const handleSubscribe = () => {
    // Handle newsletter subscription
    console.log('Subscribed:', email.value)
    email.value = ''
  }
</script>