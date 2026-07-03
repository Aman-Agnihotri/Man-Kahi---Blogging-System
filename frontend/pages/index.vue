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
      <div class="mb-8">
        <h2 class="text-3xl font-bold text-primary-900">Featured Stories</h2>
        <p class="text-primary-600 mt-2">Discover the best of ManKahi</p>
      </div>

      <div v-if="error" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-8">
        {{ error }}
      </div>

      <div v-if="initialLoading" class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div v-for="i in 3" :key="i" class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="w-full h-48 bg-primary-100 animate-pulse"></div>
          <div class="p-6 space-y-4">
            <div class="h-6 w-3/4 bg-primary-100 animate-pulse rounded"></div>
            <div class="h-4 w-full bg-primary-100 animate-pulse rounded"></div>
            <div class="h-4 w-2/3 bg-primary-100 animate-pulse rounded"></div>
          </div>
        </div>
      </div>

      <div v-else-if="!error && posts.length === 0" class="text-center py-16 bg-white rounded-xl shadow-sm">
        <p class="text-lg text-primary-700 mb-4">No stories published yet — be the first to write one!</p>
        <NuxtLink to="/content/write"
          class="inline-flex items-center px-5 py-2 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors">
          Start Writing
        </NuxtLink>
      </div>

      <div v-else class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <article v-for="post in posts" :key="post.id"
          class="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <NuxtLink :to="`/post/${post.slug}`">
            <img v-if="post.coverImage" :src="post.coverImage" :alt="post.title" class="w-full h-48 object-cover">
            <div v-else class="w-full h-48 bg-primary-100"></div>
          </NuxtLink>
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
              {{ post.excerpt ?? '' }}
            </p>

            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <span
                  class="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold uppercase">
                  {{ post.authorUsername?.charAt(0) ?? '?' }}
                </span>
                <div>
                  <span class="text-sm font-medium text-primary-900">
                    {{ post.authorUsername ?? 'Unknown' }}
                  </span>
                  <p class="text-sm text-primary-500">
                    {{ formatDate(post.publishedAt) }}
                  </p>
                </div>
              </div>

              <div class="flex items-center space-x-4 text-sm text-primary-500">
                <span class="flex items-center">
                  <i class="ri-eye-line mr-1"></i>
                  {{ post.views }}
                </span>
                <span class="flex items-center">
                  <i class="ri-time-line mr-1"></i>
                  {{ post.readTime }} min read
                </span>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div v-if="!initialLoading && posts.length > 0 && page < totalPages" class="text-center mt-12">
        <button @click="loadMore"
          class="px-6 py-3 bg-white border-2 border-primary-600 text-primary-600 font-semibold rounded-lg hover:bg-primary-50 transition-colors"
          :disabled="loadingMore">
          {{ loadingMore ? 'Loading...' : 'Load More Stories' }}
        </button>
      </div>
    </section>

    <section class="max-w-6xl mx-auto px-4 py-12">
      <div class="mb-8">
        <h2 class="text-3xl font-bold text-primary-900">Trending Now</h2>
        <p class="text-primary-600 mt-2">What readers are loving right now</p>
      </div>

      <div v-if="trendingError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-8">
        {{ trendingError }}
      </div>

      <div v-if="trendingLoading" class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div v-for="i in 3" :key="i" class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="w-full h-48 bg-primary-100 animate-pulse"></div>
          <div class="p-6 space-y-4">
            <div class="h-6 w-3/4 bg-primary-100 animate-pulse rounded"></div>
            <div class="h-4 w-full bg-primary-100 animate-pulse rounded"></div>
            <div class="h-4 w-2/3 bg-primary-100 animate-pulse rounded"></div>
          </div>
        </div>
      </div>

      <div v-else-if="!trendingError && trendingPosts.length === 0" class="text-center py-16 bg-white rounded-xl shadow-sm">
        <p class="text-lg text-primary-700">Nothing trending just yet — check back soon.</p>
      </div>

      <div v-else class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <article v-for="trendingPost in trendingPosts" :key="trendingPost.id"
          class="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <NuxtLink :to="`/post/${trendingPost.slug}`">
            <img v-if="trendingPost.coverImage" :src="trendingPost.coverImage" :alt="trendingPost.title"
              class="w-full h-48 object-cover">
            <div v-else class="w-full h-48 bg-primary-100"></div>
          </NuxtLink>
          <div class="p-6">
            <div class="flex items-center space-x-2 mb-4">
              <span v-for="tag in tagNames(trendingPost)" :key="tag"
                class="px-2 py-1 bg-primary-100 text-primary-700 text-sm rounded-full">
                {{ tag }}
              </span>
            </div>

            <NuxtLink :to="`/post/${trendingPost.slug}`">
              <h3 class="text-xl font-semibold text-primary-900 mb-2 hover:text-primary-600">
                {{ trendingPost.title }}
              </h3>
            </NuxtLink>

            <p class="text-primary-600 mb-4 line-clamp-2">
              {{ trendingPost.excerpt ?? '' }}
            </p>

            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <img v-if="trendingPost.author?.profileImage" :src="trendingPost.author.profileImage"
                  :alt="trendingPost.author.username" class="w-10 h-10 rounded-full object-cover">
                <span v-else
                  class="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold uppercase">
                  {{ trendingPost.author?.username?.charAt(0) ?? '?' }}
                </span>
                <div>
                  <span class="text-sm font-medium text-primary-900">
                    {{ trendingPost.author?.username ?? 'Unknown' }}
                  </span>
                  <p class="text-sm text-primary-500">
                    {{ formatDate(trendingPost.publishedAt) }}
                  </p>
                </div>
              </div>

              <div class="flex items-center space-x-4 text-sm text-primary-500">
                <span class="flex items-center">
                  <i class="ri-eye-line mr-1"></i>
                  {{ trendingPost.analytics?.views ?? 0 }}
                </span>
                <span class="flex items-center">
                  <i class="ri-time-line mr-1"></i>
                  {{ trendingPost.readTime }} min read
                </span>
              </div>
            </div>
          </div>
        </article>
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
  import type { SearchBlogsResult, Blog } from '~/types/blog'
  import { tagNames } from '~/types/blog'
  import type { ApiError } from '~/types/admin'

  const blogApi = useBlogApi()

  const posts = ref<SearchBlogsResult['blogs']>([])
  const page = ref(1)
  const totalPages = ref(1)
  const initialLoading = ref(true)
  const loadingMore = ref(false)
  const error = ref('')

  const trendingPosts = ref<Blog[]>([])
  const trendingLoading = ref(true)
  const trendingError = ref('')

  const loadInitial = async () => {
    initialLoading.value = true
    error.value = ''
    try {
      const result = await blogApi.search({ sortBy: 'recent', limit: 9 })
      posts.value = result.blogs
      page.value = result.page
      totalPages.value = result.totalPages
    } catch (err) {
      error.value = (err as ApiError)?.message ?? 'Failed to load stories.'
    } finally {
      initialLoading.value = false
    }
  }

  const loadMore = async () => {
    if (loadingMore.value || page.value >= totalPages.value) return
    loadingMore.value = true
    error.value = ''
    try {
      const result = await blogApi.search({ sortBy: 'recent', limit: 9, page: page.value + 1 })
      posts.value = [...posts.value, ...result.blogs]
      page.value = result.page
      totalPages.value = result.totalPages
    } catch (err) {
      error.value = (err as ApiError)?.message ?? 'Failed to load more stories.'
    } finally {
      loadingMore.value = false
    }
  }

  const loadTrending = async () => {
    trendingLoading.value = true
    trendingError.value = ''
    try {
      trendingPosts.value = await blogApi.getTrending(5)
    } catch (err) {
      trendingError.value = (err as ApiError)?.message ?? 'Failed to load trending stories.'
    } finally {
      trendingLoading.value = false
    }
  }

  const formatDate = (date: string | null) => {
    if (!date) return 'Draft'
    return new Date(date).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  onMounted(() => {
    loadInitial()
    loadTrending()
  })
</script>
