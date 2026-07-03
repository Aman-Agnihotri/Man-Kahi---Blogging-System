<template>
  <div class="min-h-screen bg-primary-50">
    <!-- Loading -->
    <div v-if="loading" class="max-w-7xl mx-auto px-4 py-12 space-y-8">
      <div class="bg-white rounded-xl shadow-sm p-8 flex items-center space-x-8">
        <div class="w-24 h-24 rounded-full bg-primary-100 animate-pulse"></div>
        <div class="flex-1 space-y-3">
          <div class="h-6 w-48 bg-primary-100 animate-pulse rounded"></div>
          <div class="h-4 w-32 bg-primary-100 animate-pulse rounded"></div>
          <div class="h-4 w-64 bg-primary-100 animate-pulse rounded"></div>
        </div>
      </div>
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div v-for="i in 3" :key="i" class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="w-full h-48 bg-primary-100 animate-pulse"></div>
          <div class="p-6 space-y-4">
            <div class="h-6 w-3/4 bg-primary-100 animate-pulse rounded"></div>
            <div class="h-4 w-full bg-primary-100 animate-pulse rounded"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Not found -->
    <div v-else-if="notFound" class="max-w-4xl mx-auto px-4 py-24 text-center">
      <h1 class="text-3xl font-bold text-primary-900 mb-4">User not found</h1>
      <p class="text-primary-600 mb-8">This profile may have been removed or never existed.</p>
      <NuxtLink to="/content/explore"
        class="inline-flex items-center px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors">
        Back to Explore
      </NuxtLink>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="max-w-4xl mx-auto px-4 py-12">
      <div class="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
        {{ error }}
      </div>
    </div>

    <template v-else-if="profile">
      <div class="bg-white shadow">
        <div class="max-w-7xl mx-auto px-4 py-8">
          <div class="flex items-center space-x-8 flex-wrap gap-y-4">
            <img
              v-if="profile.profileImage"
              :src="profile.profileImage"
              :alt="profile.username"
              class="w-24 h-24 rounded-full object-cover border-4 border-primary-200"
            >
            <span
              v-else
              class="w-24 h-24 rounded-full border-4 border-primary-200 bg-primary-100 text-primary-700 flex items-center justify-center text-3xl font-semibold uppercase"
            >
              {{ profile.username.charAt(0) }}
            </span>

            <div>
              <h1 class="text-3xl font-bold text-primary-900">{{ profile.username }}</h1>
              <p v-if="profile.bio" class="mt-2 text-primary-700 max-w-2xl">{{ profile.bio }}</p>

              <div v-if="hasSocialLinks" class="mt-3 flex items-center space-x-4">
                <a v-if="profile.socialLinks?.twitter" :href="profile.socialLinks.twitter" target="_blank"
                  rel="noopener noreferrer" class="text-primary-500 hover:text-primary-700">
                  <i class="ri-twitter-fill text-xl"></i>
                </a>
                <a v-if="profile.socialLinks?.github" :href="profile.socialLinks.github" target="_blank"
                  rel="noopener noreferrer" class="text-primary-500 hover:text-primary-700">
                  <i class="ri-github-fill text-xl"></i>
                </a>
                <a v-if="profile.socialLinks?.linkedin" :href="profile.socialLinks.linkedin" target="_blank"
                  rel="noopener noreferrer" class="text-primary-500 hover:text-primary-700">
                  <i class="ri-linkedin-fill text-xl"></i>
                </a>
                <a v-if="profile.socialLinks?.website" :href="profile.socialLinks.website" target="_blank"
                  rel="noopener noreferrer" class="text-primary-500 hover:text-primary-700">
                  <i class="ri-global-line text-xl"></i>
                </a>
              </div>

              <div class="mt-4 flex items-center space-x-4">
                <span class="text-sm text-primary-600">
                  <strong>{{ followersCount }}</strong> followers
                </span>
                <span class="text-sm text-primary-600">
                  <strong>{{ profile.followingCount }}</strong> following
                </span>
                <span class="text-sm text-primary-600">
                  <strong>{{ postsTotal }}</strong> stories
                </span>
              </div>
            </div>

            <div class="ml-auto">
              <NuxtLink
                v-if="isOwnProfile"
                to="/user/settings"
                class="px-4 py-2 border-2 border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50"
              >
                Edit Profile
              </NuxtLink>
              <button
                v-else-if="auth.isAuthenticated"
                :disabled="followLoading"
                :class="{
                  'px-4 py-2 rounded-lg border-2 disabled:opacity-50': true,
                  'border-primary-600 text-primary-600 hover:bg-primary-50': !isFollowing,
                  'border-primary-600 bg-primary-600 text-white hover:bg-primary-700': isFollowing,
                }"
                @click="toggleFollow"
              >
                {{ isFollowing ? 'Unfollow' : 'Follow' }}
              </button>
            </div>
          </div>

          <p v-if="followError" class="mt-4 text-sm text-red-600">{{ followError }}</p>
        </div>
      </div>

      <div class="max-w-7xl mx-auto px-4 py-8">
        <h2 class="text-2xl font-bold text-primary-900 mb-6">Stories</h2>

        <div v-if="postsError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
          {{ postsError }}
        </div>

        <div v-if="!posts.length" class="bg-white rounded-xl shadow-sm p-12 text-center text-primary-600">
          {{ profile.username }} hasn't published any stories yet.
        </div>

        <div v-else class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <article
            v-for="post in posts"
            :key="post.id"
            class="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
          >
            <NuxtLink :to="`/post/${post.slug}`">
              <img v-if="post.coverImage" :src="post.coverImage" :alt="post.title" class="w-full h-48 object-cover">
              <div v-else class="w-full h-48 bg-primary-100"></div>
            </NuxtLink>
            <div class="p-6">
              <div class="flex items-center space-x-2 mb-4">
                <span
                  v-for="tag in tagNames(post)"
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
                {{ post.excerpt ?? '' }}
              </p>

              <div class="flex items-center justify-between">
                <p class="text-sm text-primary-500">
                  {{ formatDate(post.publishedAt) }}
                </p>

                <div class="flex items-center space-x-4 text-sm text-primary-500">
                  <span class="flex items-center">
                    <i class="ri-eye-line mr-1"></i>
                    {{ post.analytics?.views ?? 0 }}
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

        <div v-if="posts.length > 0 && postsPage < postsTotalPages" class="mt-12 flex justify-center">
          <button
            :disabled="loadingMorePosts"
            class="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            @click="loadMorePosts"
          >
            {{ loadingMorePosts ? 'Loading...' : 'Load More Stories' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Blog } from '~/types/blog'
import { tagNames } from '~/types/blog'
import type { PublicProfile } from '~/types/auth'
import type { ApiError } from '~/types/admin'

const route = useRoute()
const username = route.params.username as string

const auth = useAuthStore()
const profileApi = useProfileApi()
const blogApi = useBlogApi()

const profile = ref<PublicProfile | null>(null)
const loading = ref(true)
const notFound = ref(false)
const error = ref('')

const isOwnProfile = computed(() => auth.isAuthenticated && auth.user?.username === username)

// --- Follow/unfollow ----------------------------------------------------

const isFollowing = ref(false)
const followersCount = ref(0)
const followLoading = ref(false)
const followError = ref('')

async function toggleFollow() {
  if (!profile.value || followLoading.value) return
  followLoading.value = true
  followError.value = ''
  try {
    const result = isFollowing.value
      ? await profileApi.unfollow(profile.value.id)
      : await profileApi.follow(profile.value.id)
    isFollowing.value = result.following
    followersCount.value = result.followersCount
  } catch (err) {
    followError.value = (err as ApiError)?.message ?? 'Failed to update follow status.'
  } finally {
    followLoading.value = false
  }
}

// --- Posts ---------------------------------------------------------------

const POSTS_LIMIT = 9
const posts = ref<Blog[]>([])
const postsTotal = ref(0)
const postsPage = ref(1)
const postsTotalPages = ref(1)
const loadingMorePosts = ref(false)
const postsError = ref('')

async function loadPosts(page: number) {
  if (!profile.value) return
  try {
    const result = await blogApi.getUserBlogs(profile.value.id, page, POSTS_LIMIT)
    posts.value = page === 1 ? result.blogs : [...posts.value, ...result.blogs]
    postsTotal.value = result.total
    postsPage.value = result.page
    postsTotalPages.value = result.totalPages
  } catch (err) {
    postsError.value = (err as ApiError)?.message ?? 'Failed to load stories.'
  }
}

function loadMorePosts() {
  if (loadingMorePosts.value || postsPage.value >= postsTotalPages.value) return
  loadingMorePosts.value = true
  loadPosts(postsPage.value + 1).finally(() => {
    loadingMorePosts.value = false
  })
}

// --- Profile ---------------------------------------------------------------

const hasSocialLinks = computed(() => {
  const links = profile.value?.socialLinks
  return !!(links && (links.twitter || links.github || links.linkedin || links.website))
})

async function loadProfile() {
  loading.value = true
  notFound.value = false
  error.value = ''
  try {
    const result = await profileApi.getPublicProfile(username)
    profile.value = result
    isFollowing.value = result.isFollowedByMe
    followersCount.value = result.followersCount
    await loadPosts(1)
  } catch (err) {
    const apiErr = err as ApiError
    if (apiErr?.status === 404) {
      notFound.value = true
    } else {
      error.value = apiErr?.message ?? 'Failed to load this profile.'
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

onMounted(loadProfile)
</script>
