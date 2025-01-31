<template>
  <div class="root">
    <section class="text-center py-16 bg-gradient-to-b from-primary-100 to-primary-50">
      <h1 class="text-5xl font-bold text-primary-900 mb-6">
        Share Your Stories with the World
      </h1>
      <p class="text-xl text-primary-600 max-w-2xl mx-auto mb-8">
        ManKahi is a platform where ideas come to life. Write, share, and connect with readers around the globe.
      </p>
      <NuxtLink to="/content/write"
        class="inline-flex items-center px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors">
        Start Writing
      </NuxtLink>
    </section>

    <section class="max-w-6xl mx-auto px-4 py-12">
      <div class="flex justify-between items-center mb-8">
        <div>
          <h2 class="text-3xl font-bold text-primary-900">Featured Stories</h2>
          <p class="text-primary-600 mt-2">Discover the best of ManKahi</p>
        </div>
        <div class="flex space-x-4">
          <select v-model="selectedCategory"
            class="rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500 bg-white">
            <option value="">All Categories</option>
            <option v-for="category in categories" :key="category.id" :value="category.id">
              {{ category.name }}
            </option>
          </select>
          <select v-model="selectedTag"
            class="rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500 bg-white">
            <option value="">All Tags</option>
            <option v-for="tag in tags" :key="tag.id" :value="tag.id">
              {{ tag.name }}
            </option>
          </select>
        </div>
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

            <p class="text-primary-600 mb-4 line-clamp-2">
              {{ post.excerpt }}
            </p>

            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <img :src="post.author.avatar" :alt="post.author.name" class="w-10 h-10 rounded-full">
                <div>
                  <NuxtLink :to="`/user/@${post.author.username}`"
                    class="text-sm font-medium text-primary-900 hover:text-primary-600">
                    {{ post.author.name }}
                  </NuxtLink>
                  <p class="text-sm text-primary-500">
                    {{ formatDate(post.publishedAt) }}
                  </p>
                </div>
              </div>

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

      <div class="text-center mt-12">
        <button @click="loadMore"
          class="px-6 py-3 bg-white border-2 border-primary-600 text-primary-600 font-semibold rounded-lg hover:bg-primary-50 transition-colors"
          :disabled="loading">
          {{ loading ? 'Loading...' : 'Load More Stories' }}
        </button>
      </div>
    </section>

    <section class="bg-primary-50 py-16">
      <div class="max-w-6xl mx-auto px-4">
        <h2 class="text-3xl font-bold text-primary-900 text-center mb-12">Why Write on ManKahi?</h2>
        <div class="grid md:grid-cols-3 gap-8">
          <div class="text-center">
            <div class="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i class="ri-quill-pen-line text-2xl text-primary-600"></i>
            </div>
            <h3 class="text-xl font-semibold text-primary-800 mb-2">Easy to Use</h3>
            <p class="text-primary-600">Start writing immediately with our intuitive editor</p>
          </div>
          <div class="text-center">
            <div class="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i class="ri-group-line text-2xl text-primary-600"></i>
            </div>
            <h3 class="text-xl font-semibold text-primary-800 mb-2">Reach Readers</h3>
            <p class="text-primary-600">Connect with millions of readers worldwide</p>
          </div>
          <div class="text-center">
            <div class="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i class="ri-line-chart-line text-2xl text-primary-600"></i>
            </div>
            <h3 class="text-xl font-semibold text-primary-800 mb-2">Track Growth</h3>
            <p class="text-primary-600">Monitor your impact with detailed analytics</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
  const selectedCategory = ref('')
  const selectedTag = ref('')
  const loading = ref(false)

  // Simulate async data load naturally
  const { data: asyncData } = await useAsyncData('initial-data', async () => {
    // In a real app, this would be an API call
    // Using timeout to simulate network request
    await new Promise(resolve => setTimeout(resolve, 100))
    return true
  })

  const categories = ref([
    { id: 1, name: 'Article' },
    { id: 2, name: 'Project' },
    { id: 3, name: 'Guide' },
    { id: 4, name: 'Interactive' }
  ])

  const tags = ref([
    { id: 1, name: 'Technology' },
    { id: 2, name: 'Life' },
    { id: 3, name: 'Programming' },
    { id: 4, name: 'Design' },
    { id: 5, name: 'Writing' }
  ])

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
        username: 'sarahchen',
        avatar: 'https://i.pravatar.cc/150?img=1'
      },
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
      author: {
        name: 'Michael Park',
        username: 'michaelpark',
        avatar: 'https://i.pravatar.cc/150?img=2'
      },
      publishedAt: '2024-03-28T15:30:00Z',
      stats: {
        views: '1.8k',
        readTime: 12
      }
    },
    {
      id: 3,
      title: 'The Future of Web Development',
      slug: 'future-of-web-development',
      excerpt: 'Exploring upcoming trends and technologies that will shape the future of web development.',
      coverImage: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80',
      tags: ['Technology', 'Programming'],
      author: {
        name: 'Emma Wilson',
        username: 'emmawilson',
        avatar: 'https://i.pravatar.cc/150?img=3'
      },
      publishedAt: '2024-03-25T09:15:00Z',
      stats: {
        views: '3.2k',
        readTime: 10
      }
    }
  ])

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  const loadMore = () => {
    loading.value = true
    // Simulate loading more posts
    setTimeout(() => {
      loading.value = false
    }, 1000)
  }
</script>