<template>
  <div class="min-h-screen bg-primary-50">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="mb-8 flex justify-between items-center">
        <h1 class="text-3xl font-bold text-primary-900">Dashboard</h1>
        <NuxtLink to="/content/write" class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          Write New Story
        </NuxtLink>
      </div>

      <!-- Error -->
      <div v-if="error" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
        {{ error }}
      </div>

      <!-- Loading -->
      <div v-if="loading" class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div v-for="i in 3" :key="i" class="bg-white p-6 rounded-xl shadow-sm">
          <div class="h-4 w-24 bg-primary-200 animate-pulse rounded mb-4"></div>
          <div class="h-8 w-16 bg-primary-200 animate-pulse rounded"></div>
        </div>
      </div>

      <!-- Stats -->
      <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div class="bg-white p-6 rounded-xl shadow-sm">
          <h3 class="text-lg font-semibold text-primary-900 mb-2">Total Stories</h3>
          <p class="text-3xl font-bold text-primary-600">{{ totalCount }}</p>
        </div>

        <div class="bg-white p-6 rounded-xl shadow-sm">
          <h3 class="text-lg font-semibold text-primary-900 mb-2">Published</h3>
          <p class="text-3xl font-bold text-primary-600">{{ publishedCount }}</p>
        </div>

        <div class="bg-white p-6 rounded-xl shadow-sm">
          <h3 class="text-lg font-semibold text-primary-900 mb-2">Drafts</h3>
          <p class="text-3xl font-bold text-primary-600">{{ draftCount }}</p>
        </div>
      </div>

      <!-- Recent Stories -->
      <div class="mt-8">
        <h2 class="text-2xl font-bold text-primary-900 mb-6">Recent Stories</h2>

        <div v-if="loading" class="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div v-for="i in 3" :key="i" class="h-10 w-full bg-primary-200 animate-pulse rounded"></div>
        </div>

        <div v-else-if="!recentStories.length" class="bg-white rounded-xl shadow-sm p-8 text-center text-primary-600">
          You haven't published anything yet —
          <NuxtLink to="/content/write" class="text-primary-700 font-medium hover:underline">start writing!</NuxtLink>
        </div>

        <div v-else class="bg-white rounded-xl shadow-sm overflow-hidden">
          <table class="min-w-full divide-y divide-primary-200">
            <thead class="bg-primary-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                  Title
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                  Status
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                  Views
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                  Published
                </th>
                <th class="px-6 py-3 text-right text-xs font-medium text-primary-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-primary-200">
              <tr v-for="story in recentStories" :key="story.id">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-medium text-primary-900">{{ story.title }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="{
                    'px-2 py-1 text-xs font-medium rounded-full': true,
                    'bg-green-100 text-green-800': story.published,
                    'bg-yellow-100 text-yellow-800': !story.published
                  }">
                    {{ story.published ? 'Published' : 'Draft' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-primary-500">
                  {{ story.analytics?.views ?? 0 }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-primary-500">
                  {{ formatDate(story.publishedAt) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <NuxtLink :to="`/content/write?edit=${story.slug}`" class="text-primary-600 hover:text-primary-900">
                    Edit
                  </NuxtLink>
                  <button
                    class="ml-4 text-red-600 hover:text-red-900 disabled:opacity-50"
                    :disabled="deletingId === story.id"
                    @click="handleDelete(story.id)"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="deleteError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mt-4">
          {{ deleteError }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Blog } from '~/types/blog';

definePageMeta({ requiresAuth: true });

const blogApi = useBlogApi();

const loading = ref(true);
const error = ref<string | null>(null);
const deleteError = ref<string | null>(null);
const deletingId = ref<string | null>(null);

const myBlogs = ref<Blog[]>([]);
const totalCount = ref(0);

// Fetched with a large practical limit so both the accurate published/draft
// breakdown and the "recent" slice can come from a single request.
const STATS_LIMIT = 100;

const recentStories = computed(() => myBlogs.value.slice(0, 5));
const publishedCount = computed(() => myBlogs.value.filter((b) => b.published).length);
const draftCount = computed(() => myBlogs.value.filter((b) => !b.published).length);

function formatDate(date: string | null): string {
  if (!date) return 'Not published';
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function loadBlogs() {
  loading.value = true;
  error.value = null;
  try {
    const res = await blogApi.getMyBlogs(1, STATS_LIMIT);
    myBlogs.value = res.blogs;
    totalCount.value = res.total;
  } catch (e: any) {
    error.value = e?.message ?? 'Failed to load your stories.';
  } finally {
    loading.value = false;
  }
}

async function handleDelete(id: string) {
  if (!confirm('Are you sure you want to delete this story?')) return;
  deleteError.value = null;
  deletingId.value = id;
  try {
    await blogApi.remove(id);
    myBlogs.value = myBlogs.value.filter((b) => b.id !== id);
    totalCount.value = Math.max(0, totalCount.value - 1);
  } catch (e: any) {
    deleteError.value = e?.message ?? 'Failed to delete the story.';
  } finally {
    deletingId.value = null;
  }
}

onMounted(loadBlogs);
</script>
