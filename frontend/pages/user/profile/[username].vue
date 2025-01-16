<template>
  <div class="min-h-screen bg-primary-50">
    <div class="bg-white shadow">
      <div class="max-w-7xl mx-auto px-4 py-8">
        <div class="flex items-center space-x-8">
          <img
            :src="profile.avatar"
            :alt="profile.name"
            class="w-24 h-24 rounded-full border-4 border-primary-200"
          >
          <div>
            <h1 class="text-3xl font-bold text-primary-900">{{ profile.name }}</h1>
            <p class="text-primary-600">@{{ profile.username }}</p>
            <p class="mt-2 text-primary-700 max-w-2xl">{{ profile.bio }}</p>
            <div class="mt-4 flex items-center space-x-4">
              <span class="text-sm text-primary-600">
                <strong>{{ profile.stats.followers }}</strong> followers
              </span>
              <span class="text-sm text-primary-600">
                <strong>{{ profile.stats.following }}</strong> following
              </span>
              <span class="text-sm text-primary-600">
                <strong>{{ profile.stats.stories }}</strong> stories
              </span>
            </div>
          </div>
          <div class="ml-auto">
            <button
              v-if="profile.username !== 'currentuser'"
              class="px-4 py-2 border-2 border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50"
            >
              Follow
            </button>
            <NuxtLink
              v-else
              to="/settings"
              class="px-4 py-2 border-2 border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50"
            >
              Edit Profile
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>

    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="flex items-center justify-between mb-8">
        <div class="flex space-x-4">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :class="{
              'px-4 py-2 rounded-lg font-medium': true,
              'bg-primary-600 text-white': activeTab === tab.id,
              'text-primary-600 hover:bg-primary-50': activeTab !== tab.id
            }"
            @click="activeTab = tab.id"
          >
            {{ tab.name }}
          </button>
        </div>
        
        <div class="flex items-center space-x-4">
          <select
            v-model="selectedCategory"
            class="rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="">All Categories</option>
            <option v-for="category in categories" :key="category.id" :value="category.id">
              {{ category.name }}
            </option>
          </select>
        </div>
      </div>

      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <article
          v-for="post in posts"
          :key="post.id"
          class="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
        >
          <img
            :src="post.coverImage"
            :alt="post.title"
            class="w-full h-48 object-cover"
          >
          <div class="p-6">
            <div class="flex items-center space-x-2 mb-4">
              <span
                v-for="tag in post.tags"
                :key="tag"
                class="px-2 py-1 bg-primary-100 text-primary-700 text-sm rounded-full"
              >
                {{ tag }}
              </span>
            </div>
            
            <NuxtLink :to="`/post/${post.slug}`">
              <h3 class="text-xl font-semibold text-primary-900 mb-2 hover:text-primary-600">
                {{ post.title }}
              </h3>
            </NuxtLink>
            
            <p class="text-primary-600 mb-4 line-clamp-2">
              {{ post.excerpt }}
            </p>
            
            <div class="flex items-center justify-between">
              <p class="text-sm text-primary-500">
                {{ formatDate(post.publishedAt) }}
              </p>
              
              <div class="flex items-center space-x-4 text-sm text-primary-500">
                <span class="flex items-center">
                  <i class="ri-eye-line mr-1"></i>
                  {{ post.stats.views }}
                </span>
                <span class="flex items-center">
                  <i class="ri-time-line mr-1"></i>
                  {{ post.stats.readTime }} min read
                </span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const username = route.params.username as string

const activeTab = ref('stories')
const selectedCategory = ref('')

const tabs = [
  { id: 'stories', name: 'Stories' },
  { id: 'series', name: 'Series' },
  { id: 'about', name: 'About' }
]

const categories = ref([
  { id: 1, name: 'Article' },
  { id: 2, name: 'Project' },
  { id: 3, name: 'Guide' },
  { id: 4, name: 'Interactive' }
])

// Dummy profile data
const profile = ref({
  name: 'Sarah Chen',
  username: 'sarahchen',
  bio: 'Software engineer by day, writer by night. Passionate about technology, design, and storytelling.',
  avatar: 'https://i.pravatar.cc/150?img=1',
  stats: {
    followers: '2.5k',
    following: '1.2k',
    stories: 24
  }
})

// Dummy posts data
const posts = ref([
  {
    id: 1,
    title: 'The Art of Mindful Programming',
    slug: 'art-of-mindful-programming',
    excerpt: 'Discover how mindfulness can improve your coding practice and make you a better developer.',
    coverImage: 'https://images.unsplash.com/photo-1516259762381-22954d7d3ad2?auto=format&fit=crop&q=80',
    tags: ['Technology', 'Programming'],
    publishedAt: '2024-04-01T12:00:00Z',
    stats: {
      views: '2.5k',
      readTime: 8
    }
  },
  {
    id: 2,
    title: 'Building Sustainable Design Systems',
    slug: 'sustainable-design-systems',
    excerpt: 'Learn how to create and maintain scalable design systems that grow with your product.',
    coverImage: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&q=80',
    tags: ['Design', 'Technology'],
    publishedAt: '2024-03-28T15:30:00Z',
    stats: {
      views: '1.8k',
      readTime: 12
    }
  }
])

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}
</script>