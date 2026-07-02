<template>
  <div class="min-h-screen bg-primary-50">
    <div v-if="loading" class="max-w-4xl mx-auto px-4 py-12 space-y-8">
      <div class="h-8 w-2/3 bg-primary-100 animate-pulse rounded"></div>
      <div class="h-12 w-full bg-primary-100 animate-pulse rounded"></div>
      <div class="h-96 w-full bg-primary-100 animate-pulse rounded-xl"></div>
      <div class="space-y-4">
        <div class="h-4 w-full bg-primary-100 animate-pulse rounded"></div>
        <div class="h-4 w-5/6 bg-primary-100 animate-pulse rounded"></div>
        <div class="h-4 w-2/3 bg-primary-100 animate-pulse rounded"></div>
      </div>
    </div>

    <div v-else-if="notFound" class="max-w-4xl mx-auto px-4 py-24 text-center">
      <h1 class="text-3xl font-bold text-primary-900 mb-4">Post not found</h1>
      <p class="text-primary-600 mb-8">This story may have been removed or never existed.</p>
      <NuxtLink to="/content/explore"
        class="inline-flex items-center px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors">
        Back to Explore
      </NuxtLink>
    </div>

    <div v-else-if="error" class="max-w-4xl mx-auto px-4 py-12">
      <div class="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
        {{ error }}
      </div>
    </div>

    <template v-else-if="post">
      <article class="max-w-4xl mx-auto px-4 py-12">
        <header class="mb-8">
          <div class="flex items-center space-x-2 mb-4">
            <span
              v-for="tag in tagNames(post)"
              :key="tag"
              class="px-2 py-1 bg-primary-100 text-primary-700 text-sm rounded-full"
            >
              {{ tag }}
            </span>
          </div>

          <h1 class="text-4xl font-bold text-primary-900 mb-4">
            {{ post.title }}
          </h1>

          <div class="flex items-center justify-between flex-wrap gap-4">
            <div class="flex items-center space-x-4">
              <div class="flex items-center space-x-3">
                <img v-if="post.author?.profileImage" :src="post.author.profileImage" :alt="post.author.username"
                  class="w-12 h-12 rounded-full object-cover">
                <span v-else
                  class="w-12 h-12 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-lg font-semibold uppercase">
                  {{ post.author?.username?.charAt(0) ?? '?' }}
                </span>
                <div>
                  <p class="font-medium text-primary-900">{{ post.author?.username ?? 'Unknown' }}</p>
                  <p class="text-sm text-primary-600">{{ formatDate(post.publishedAt) }}</p>
                </div>
              </div>

              <button disabled title="Coming soon"
                class="px-4 py-2 border-2 border-primary-200 text-primary-400 rounded-lg cursor-not-allowed opacity-60">
                Follow
              </button>
            </div>

            <div class="flex items-center space-x-4 text-primary-400">
              <button disabled title="Coming soon" class="flex items-center space-x-2 cursor-not-allowed opacity-60">
                <i class="ri-bookmark-line text-xl"></i>
                <span>Save</span>
              </button>
              <button disabled title="Coming soon" class="flex items-center space-x-2 cursor-not-allowed opacity-60">
                <i class="ri-share-line text-xl"></i>
                <span>Share</span>
              </button>
            </div>
          </div>
        </header>

        <img v-if="post.coverImage" :src="post.coverImage" :alt="post.title"
          class="w-full h-96 object-cover rounded-xl mb-8">
        <div v-else class="w-full h-96 bg-primary-100 rounded-xl mb-8"></div>

        <div class="prose prose-lg max-w-none">
          <div v-html="post.content"></div>
        </div>

        <footer class="mt-12 pt-8 border-t border-primary-200">
          <div class="flex items-center justify-between flex-wrap gap-4">
            <div class="flex items-center space-x-4">
              <span class="flex items-center space-x-2 text-primary-600">
                <i class="ri-heart-line text-xl"></i>
                <span>{{ post.analytics?.likes ?? 0 }}</span>
              </span>
              <span class="flex items-center space-x-2 text-primary-600">
                <i class="ri-chat-1-line text-xl"></i>
                <span>{{ post.analytics?.comments ?? 0 }}</span>
              </span>
            </div>

            <div class="flex items-center space-x-4 text-sm text-primary-500">
              <span class="flex items-center">
                <i class="ri-eye-line mr-1"></i>
                {{ post.analytics?.views ?? 0 }} views
              </span>
              <span class="flex items-center">
                <i class="ri-time-line mr-1"></i>
                {{ post.readTime }} min read
              </span>
            </div>
          </div>
        </footer>
      </article>

      <div v-if="relatedPosts.length" class="max-w-4xl mx-auto px-4 py-12">
        <h2 class="text-2xl font-bold text-primary-900 mb-8">More from {{ post.author?.username ?? 'this author' }}</h2>
        <div class="grid md:grid-cols-2 gap-8">
          <article
            v-for="relatedPost in relatedPosts"
            :key="relatedPost.id"
            class="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
          >
            <NuxtLink :to="`/post/${relatedPost.slug}`">
              <img v-if="relatedPost.coverImage" :src="relatedPost.coverImage" :alt="relatedPost.title"
                class="w-full h-48 object-cover">
              <div v-else class="w-full h-48 bg-primary-100"></div>
            </NuxtLink>
            <div class="p-6">
              <NuxtLink :to="`/post/${relatedPost.slug}`">
                <h3 class="text-xl font-semibold text-primary-900 mb-2 hover:text-primary-600">
                  {{ relatedPost.title }}
                </h3>
              </NuxtLink>
              <p class="text-primary-600 mb-4 line-clamp-2">
                {{ relatedPost.excerpt ?? '' }}
              </p>
            </div>
          </article>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Blog } from '~/types/blog'
import { tagNames } from '~/types/blog'
import type { ApiError } from '~/types/admin'

const route = useRoute()
const slug = route.params.slug as string
const blogApi = useBlogApi()

const post = ref<Blog | null>(null)
const relatedPosts = ref<Blog[]>([])
const loading = ref(true)
const notFound = ref(false)
const error = ref('')

const loadPost = async () => {
  loading.value = true
  notFound.value = false
  error.value = ''
  try {
    const result = await blogApi.getBySlug(slug)
    post.value = result

    try {
      relatedPosts.value = await blogApi.getSuggested(result.id)
    } catch {
      relatedPosts.value = []
    }
  } catch (err) {
    const apiErr = err as ApiError
    if (apiErr?.status === 404) {
      notFound.value = true
    } else {
      error.value = apiErr?.message ?? 'Failed to load this story.'
    }
  } finally {
    loading.value = false
  }
}

const formatDate = (date: string | null) => {
  if (!date) return 'Draft'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

onMounted(loadPost)
</script>
