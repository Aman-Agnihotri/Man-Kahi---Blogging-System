<template>
  <div class="min-h-screen bg-primary-50">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <h1 class="text-3xl font-bold text-primary-900 mb-8">Bookmarks</h1>

      <div v-if="error" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
        {{ error }}
      </div>
      <div v-if="unbookmarkError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
        {{ unbookmarkError }}
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

      <div v-else-if="!error && posts.length === 0" class="bg-white rounded-xl shadow-sm p-12 text-center">
        <p class="text-lg text-primary-700 mb-4">You haven't bookmarked any stories yet.</p>
        <NuxtLink to="/content/explore"
          class="inline-flex items-center px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors">
          Explore Stories
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
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center space-x-2">
                <span v-for="tag in tagNames(post)" :key="tag"
                  class="px-2 py-1 bg-primary-100 text-primary-700 text-sm rounded-full">
                  {{ tag }}
                </span>
              </div>
              <button
                :disabled="removingId === post.id"
                title="Remove bookmark"
                class="text-primary-500 hover:text-red-600 disabled:opacity-50"
                @click="handleUnbookmark(post.id)"
              >
                <i class="ri-bookmark-fill text-xl"></i>
              </button>
            </div>

            <NuxtLink :to="`/post/${post.slug}`">
              <h3 class="text-xl font-semibold text-primary-900 mb-2 hover:text-primary-600">
                {{ post.title }}
              </h3>
            </NuxtLink>

            <p class="text-primary-600 mb-4 line-clamp-2">{{ post.excerpt ?? '' }}</p>

            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <img v-if="post.author?.profileImage" :src="post.author.profileImage" :alt="post.author.username"
                  class="w-10 h-10 rounded-full object-cover">
                <span v-else
                  class="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold uppercase">
                  {{ post.author?.username?.charAt(0) ?? '?' }}
                </span>
                <div>
                  <p class="text-sm font-medium text-primary-900">{{ post.author?.username ?? 'Unknown' }}</p>
                  <p class="text-sm text-primary-500">{{ formatDate(post.publishedAt) }}</p>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div v-if="!initialLoading && posts.length > 0 && page < totalPages" class="mt-12 flex justify-center">
        <button :disabled="loadingMore" class="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          @click="loadMore">
          {{ loadingMore ? 'Loading...' : 'Load More Stories' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Blog } from '~/types/blog'
import { tagNames } from '~/types/blog'
import type { ApiError } from '~/types/admin'

definePageMeta({ requiresAuth: true });

const blogApi = useBlogApi()

const posts = ref<Blog[]>([])
const page = ref(1)
const totalPages = ref(1)
const initialLoading = ref(true)
const loadingMore = ref(false)
const error = ref('')

const removingId = ref<string | null>(null)
const unbookmarkError = ref('')

async function loadBookmarks(reset: boolean) {
  if (reset) {
    initialLoading.value = true
  }
  error.value = ''
  try {
    const nextPage = reset ? 1 : page.value + 1
    const result = await blogApi.getBookmarks(nextPage, 12)
    posts.value = reset ? result.blogs : [...posts.value, ...result.blogs]
    page.value = result.page
    totalPages.value = result.totalPages
  } catch (err) {
    error.value = (err as ApiError)?.message ?? 'Failed to load your bookmarks.'
  } finally {
    initialLoading.value = false
    loadingMore.value = false
  }
}

function loadMore() {
  if (loadingMore.value || page.value >= totalPages.value) return
  loadingMore.value = true
  loadBookmarks(false)
}

async function handleUnbookmark(blogId: string) {
  unbookmarkError.value = ''
  removingId.value = blogId
  try {
    await blogApi.unbookmark(blogId)
    posts.value = posts.value.filter((p) => p.id !== blogId)
  } catch (err) {
    unbookmarkError.value = (err as ApiError)?.message ?? 'Failed to remove this bookmark.'
  } finally {
    removingId.value = null
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
  loadBookmarks(true)
})
</script>
