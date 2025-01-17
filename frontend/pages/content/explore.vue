<template>
  <div class="min-h-screen bg-primary-50">
    <header class="bg-white shadow-sm">
      <div class="max-w-7xl mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold text-primary-900">Explore Stories</h1>
        <p class="mt-2 text-lg text-primary-600">Discover amazing stories from our community</p>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-12">
      <div class="flex flex-wrap gap-4 mb-8">
        <button v-for="tag in popularTags" :key="tag"
          class="px-4 py-2 rounded-full bg-white shadow-sm hover:shadow-md transition-shadow text-primary-600 hover:text-primary-800">
          {{ tag }}
        </button>
      </div>

      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <article v-for="post in posts" :key="post.id"
          class="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <img :src="post.coverImage" :alt="post.title" class="w-full h-48 object-cover">
          <div class="p-6">
            <div class="flex items-center space-x-2 mb-4">
              <span v-for="tag in post.tags" :key="tag"
                class="px-2 py-1 bg-primary-100 text-primary-700 text-sm rounded-full">
                {{ tag }}
              </span>
            </div>
            <NuxtLink :to="`/post/${post.slug}`">
              <h3 class="text-xl font-semibold text-primary-900 mb-2 hover:text-primary-600">
                {{ post.title }}
              </h3>
            </NuxtLink>
            <p class="text-primary-600 mb-4 line-clamp-2">{{ post.excerpt }}</p>
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <img :src="post.author.avatar" :alt="post.author.name" class="w-10 h-10 rounded-full">
                <div>
                  <p class="text-sm font-medium text-primary-900">{{ post.author.name }}</p>
                  <p class="text-sm text-primary-500">{{ formatDate(post.publishedAt) }}</p>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div class="mt-12 flex justify-center">
        <button class="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          Load More Stories
        </button>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
const popularTags = [
  'Technology',
  'Programming',
  'Design',
  'Writing',
  'Life',
  'Career',
  'Productivity',
  'AI'
]

const posts = ref([
  {
    id: 1,
    title: 'The Art of Mindful Programming',
    slug: 'art-of-mindful-programming',
    excerpt: 'Discover how mindfulness can improve your coding practice and make you a better developer.',
    coverImage: 'https://images.unsplash.com/photo-1516259762381-22954d7d3ad2?auto=format&fit=crop&q=80',
    tags: ['Technology', 'Programming'],
    author: {
      name: 'Sarah Chen',
      avatar: 'https://i.pravatar.cc/150?img=1'
    },
    publishedAt: '2024-04-01T12:00:00Z'
  },
  {
    id: 2,
    title: 'Building Sustainable Design Systems',
    slug: 'sustainable-design-systems',
    excerpt: 'Learn how to create and maintain scalable design systems that grow with your product.',
    coverImage: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&q=80',
    tags: ['Design', 'Technology'],
    author: {
      name: 'Michael Park',
      avatar: 'https://i.pravatar.cc/150?img=2'
    },
    publishedAt: '2024-03-28T15:30:00Z'
  }
])

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}
</script>