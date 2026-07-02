<template>
  <div class="min-h-screen bg-primary-50">
    <header class="bg-white shadow-sm">
      <div class="max-w-7xl mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold text-primary-900">Explore Stories</h1>
        <p class="mt-2 text-lg text-primary-600">Discover amazing stories from our community</p>

        <form class="mt-6 flex gap-3" @submit.prevent="onSearchSubmit">
          <input v-model="query" type="search" placeholder="Search stories..."
            class="flex-1 rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500">
          <button type="submit"
            class="px-6 py-2 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors">
            Search
          </button>
        </form>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-12">
      <div v-if="popularTags.length" class="flex flex-wrap gap-4 mb-8">
        <button v-for="tag in popularTags" :key="tag.id" @click="toggleTag(tag.name)"
          class="px-4 py-2 rounded-full shadow-sm hover:shadow-md transition-shadow"
          :class="selectedTags.includes(tag.name)
            ? 'bg-primary-600 text-white'
            : 'bg-white text-primary-600 hover:text-primary-800'">
          {{ tag.name }}
        </button>
      </div>

      <div v-if="error" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-8">
        {{ error }}
      </div>

      <div v-if="initialLoading" class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div v-for="i in 6" :key="i" class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="w-full h-48 bg-primary-100 animate-pulse"></div>
          <div class="p-6 space-y-4">
            <div class="h-6 w-3/4 bg-primary-100 animate-pulse rounded"></div>
            <div class="h-4 w-full bg-primary-100 animate-pulse rounded"></div>
            <div class="h-4 w-2/3 bg-primary-100 animate-pulse rounded"></div>
          </div>
        </div>
      </div>

      <div v-else-if="!error && posts.length === 0" class="text-center py-16 bg-white rounded-xl shadow-sm">
        <p class="text-lg text-primary-700">No stories match your search.</p>
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
            <p class="text-primary-600 mb-4 line-clamp-2">{{ post.excerpt ?? '' }}</p>
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <span
                  class="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold uppercase">
                  {{ post.authorUsername?.charAt(0) ?? '?' }}
                </span>
                <div>
                  <p class="text-sm font-medium text-primary-900">{{ post.authorUsername ?? 'Unknown' }}</p>
                  <p class="text-sm text-primary-500">{{ formatDate(post.publishedAt) }}</p>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div v-if="!initialLoading && posts.length > 0 && page < totalPages" class="mt-12 flex justify-center">
        <button @click="loadMore" :disabled="loadingMore"
          class="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
          {{ loadingMore ? 'Loading...' : 'Load More Stories' }}
        </button>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import type { SearchBlogsParams, SearchBlogsResult, PopularTag } from '~/types/blog'
import type { ApiError } from '~/types/admin'

const blogApi = useBlogApi()

const query = ref('')
const selectedTags = ref<string[]>([])
const posts = ref<SearchBlogsResult['blogs']>([])
const popularTags = ref<PopularTag[]>([])
const page = ref(1)
const totalPages = ref(1)
const initialLoading = ref(true)
const loadingMore = ref(false)
const error = ref('')

const runSearch = async (reset: boolean) => {
  if (reset) {
    initialLoading.value = true
  }
  error.value = ''
  try {
    const params: SearchBlogsParams = {
      page: reset ? 1 : page.value + 1,
      limit: 12,
      sortBy: query.value.trim() ? 'relevant' : 'recent'
    }
    if (query.value.trim()) params.query = query.value.trim()
    if (selectedTags.value.length) params.tags = selectedTags.value

    const result = await blogApi.search(params)
    posts.value = reset ? result.blogs : [...posts.value, ...result.blogs]
    page.value = result.page
    totalPages.value = result.totalPages
  } catch (err) {
    error.value = (err as ApiError)?.message ?? 'Failed to load stories.'
  } finally {
    initialLoading.value = false
    loadingMore.value = false
  }
}

const loadMore = () => {
  if (loadingMore.value || page.value >= totalPages.value) return
  loadingMore.value = true
  runSearch(false)
}

const toggleTag = (name: string) => {
  const idx = selectedTags.value.indexOf(name)
  if (idx >= 0) {
    selectedTags.value.splice(idx, 1)
  } else {
    selectedTags.value.push(name)
  }
  runSearch(true)
}

const onSearchSubmit = () => {
  runSearch(true)
}

const loadPopularTags = async () => {
  try {
    popularTags.value = await blogApi.getPopularTags()
  } catch {
    // Non-critical: popular tag chips are a nice-to-have, don't block the page on this.
  }
}

const formatDate = (date: string | null) => {
  if (!date) return 'Draft'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

onMounted(() => {
  runSearch(true)
  loadPopularTags()
})
</script>
