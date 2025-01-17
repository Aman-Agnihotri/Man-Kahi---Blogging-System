<template>
  <div class="min-h-screen bg-primary-50">
    <header class="bg-white shadow-sm">
      <div class="max-w-7xl mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold text-primary-900">Categories</h1>
        <p class="mt-2 text-lg text-primary-600">Browse stories by topic</p>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-12">
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div v-for="category in categories" :key="category.id"
          class="bg-white p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div class="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
            <i :class="category.icon" class="text-2xl text-primary-600"></i>
          </div>
          <h3 class="text-xl font-semibold text-primary-900 mb-2">{{ category.name }}</h3>
          <p class="text-primary-600 mb-4">{{ category.description }}</p>
          <div class="flex items-center justify-between">
            <span class="text-sm text-primary-500">{{ category.count }} stories</span>
            <NuxtLink :to="`/categories/${category.slug}`"
              class="text-primary-600 hover:text-primary-800 font-medium">
              Browse stories →
            </NuxtLink>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
const categories = ref([
  {
    id: 1,
    name: 'Articles',
    slug: 'articles',
    description: 'In-depth articles on various topics from our community of writers.',
    icon: 'ri-article-line',
    count: '2,534'
  },
  {
    id: 2,
    name: 'Projects',
    slug: 'projects',
    description: 'Showcase of interesting projects and case studies.',
    icon: 'ri-folder-line',
    count: '1,247'
  },
  {
    id: 3,
    name: 'Step-by-Step Guides',
    slug: 'guides',
    description: 'Detailed tutorials and how-to guides for learning new skills.',
    icon: 'ri-book-line',
    count: '892'
  },
  {
    id: 4,
    name: 'Interactive',
    slug: 'interactive',
    description: 'Interactive stories and experiences that engage readers.',
    icon: 'ri-cursor-line',
    count: '345'
  },
  {
    id: 5,
    name: 'Technology',
    slug: 'technology',
    description: 'Latest insights and developments in technology.',
    icon: 'ri-code-line',
    count: '3,421'
  },
  {
    id: 6,
    name: 'Life & Culture',
    slug: 'life-culture',
    description: 'Stories about life experiences and cultural perspectives.',
    icon: 'ri-heart-line',
    count: '1,876'
  }
])
</script>