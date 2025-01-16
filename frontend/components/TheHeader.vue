<template>
  <header class="bg-white shadow-sm sticky top-0 z-50">
    <nav class="container mx-auto px-4 py-4">
      <div class="flex items-center justify-between">
        <NuxtLink to="/" class="flex items-center space-x-2">
          <span
            class="text-2xl font-bold bg-gradient-to-r from-primary-600 to-primary-800 bg-clip-text text-transparent">
            ManKahi
          </span>
        </NuxtLink>

        <div class="hidden md:flex items-center space-x-6">
          <NuxtLink v-for="item in navigationItems" :key="item.path" :to="item.path"
            class="text-primary-600 hover:text-primary-800 font-medium">
            {{ item.label }}
          </NuxtLink>
        </div>

        <div class="flex items-center space-x-6">
          <button class="md:hidden text-primary-600 hover:text-primary-800"
            @click="isMobileMenuOpen = !isMobileMenuOpen">
            <i class="ri-menu-line text-2xl"></i>
          </button>

          <template v-if="!user">
            <NuxtLink to="/auth/login" class="hidden md:block text-primary-600 hover:text-primary-800 font-medium">
              Sign In
            </NuxtLink>
            <NuxtLink to="/auth/register"
              class="hidden md:block bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors">
              Get Started
            </NuxtLink>
          </template>

          <template v-else>
            <NuxtLink to="/content/write"
              class="hidden md:block bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors">
              Write
            </NuxtLink>

            <div class="relative">
              <button @click="isUserMenuOpen = !isUserMenuOpen" class="flex items-center space-x-2">
                <img :src="user.avatar || 'https://i.pravatar.cc/150?img=4'" alt="User avatar"
                  class="w-8 h-8 rounded-full border-2 border-primary-200">
              </button>

              <div v-if="isUserMenuOpen"
                class="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1 border border-primary-100">
                <NuxtLink v-for="item in userMenuItems" :key="item.path" :to="item.path"
                  class="block px-4 py-2 text-sm text-primary-700 hover:bg-primary-50">
                  <i :class="item.icon" class="mr-2"></i>
                  {{ item.label }}
                </NuxtLink>
                <button @click="handleSignOut"
                  class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                  <i class="ri-logout-box-line mr-2"></i>
                  Sign Out
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Mobile Menu -->
      <div v-if="isMobileMenuOpen" class="md:hidden mt-4 py-4 border-t border-primary-100">
        <div class="flex flex-col space-y-4">
          <NuxtLink v-for="item in navigationItems" :key="item.path" :to="item.path"
            class="text-primary-600 hover:text-primary-800 font-medium">
            {{ item.label }}
          </NuxtLink>
          <template v-if="!user">
            <NuxtLink to="/auth/login" class="text-primary-600 hover:text-primary-800 font-medium">
              Sign In
            </NuxtLink>
            <NuxtLink to="/auth/register"
              class="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors text-center">
              Get Started
            </NuxtLink>
          </template>
        </div>
      </div>
    </nav>
  </header>
</template>

<script setup lang="ts">
  const user = ref(null) // Dummy user state
  const isUserMenuOpen = ref(false)
  const isMobileMenuOpen = ref(false)

  const navigationItems = [
    { label: 'Explore', path: '/content/explore' },
    { label: 'Categories', path: '/categories' },
    { label: 'About', path: '/docs/about' }
  ]

  const userMenuItems = [
    { label: 'Profile', path: '/user/profile', icon: 'ri-user-line' },
    { label: 'Dashboard', path: '/user/dashboard', icon: 'ri-dashboard-line' },
    { label: 'Stories', path: '/stories', icon: 'ri-book-line' },
    { label: 'Settings', path: '/user/settings', icon: 'ri-settings-line' }
  ]

  const handleSignOut = () => {
    // Handle sign out logic
    user.value = null
    isUserMenuOpen.value = false
  }
</script>