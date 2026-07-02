<template>
  <div class="min-h-screen bg-primary-50">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="mb-8 flex justify-between items-center">
        <h1 class="text-3xl font-bold text-primary-900">My Stories</h1>
        <NuxtLink to="/content/write" class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          Write New Story
        </NuxtLink>
      </div>

      <div v-if="error" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
        {{ error }}
      </div>
      <div v-if="deleteError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
        {{ deleteError }}
      </div>

      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <div class="p-4 border-b border-primary-200">
          <div class="flex items-center space-x-4">
            <select v-model="selectedStatus"
              class="rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500">
              <option value="">All Status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="p-6 space-y-4">
          <div v-for="i in 5" :key="i" class="h-10 w-full bg-primary-200 animate-pulse rounded"></div>
        </div>

        <!-- Empty -->
        <div v-else-if="!blogs.length" class="p-12 text-center text-primary-600">
          You haven't written any stories yet —
          <NuxtLink to="/content/write" class="text-primary-700 font-medium hover:underline">start writing!</NuxtLink>
        </div>

        <!-- Filtered-empty -->
        <div v-else-if="!filteredBlogs.length" class="p-12 text-center text-primary-600">
          No stories match this filter.
        </div>

        <table v-else class="min-w-full divide-y divide-primary-200">
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
            <tr v-for="story in filteredBlogs" :key="story.id">
              <td class="px-6 py-4">
                <div class="flex items-center">
                  <img v-if="story.coverImage" :src="story.coverImage" :alt="story.title"
                    class="h-10 w-16 object-cover rounded">
                  <div v-else class="h-10 w-16 rounded bg-primary-100 flex-shrink-0"></div>
                  <div class="ml-4">
                    <div class="text-sm font-medium text-primary-900">{{ story.title }}</div>
                    <div class="text-sm text-primary-500">{{ excerptPreview(story.excerpt) }}</div>
                  </div>
                </div>
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

        <div v-if="!loading && blogs.length" class="px-6 py-4 border-t border-primary-200">
          <div class="flex items-center justify-between">
            <p class="text-sm text-primary-500">
              Showing {{ rangeStart }}-{{ rangeEnd }} of {{ total }} stories
            </p>
            <div class="flex space-x-2">
              <button
                class="px-3 py-1 border border-primary-200 rounded hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="page <= 1 || loading"
                @click="goToPage(page - 1)"
              >
                Previous
              </button>
              <button
                class="px-3 py-1 border border-primary-200 rounded hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="page >= totalPages || loading"
                @click="goToPage(page + 1)"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Blog } from '~/types/blog';

definePageMeta({ requiresAuth: true });

const blogApi = useBlogApi();

const limit = 10;
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const blogs = ref<Blog[]>([]);

const loading = ref(true);
const error = ref<string | null>(null);
const deleteError = ref<string | null>(null);
const deletingId = ref<string | null>(null);

const selectedStatus = ref<'' | 'published' | 'draft'>('');

const filteredBlogs = computed(() => {
  if (!selectedStatus.value) return blogs.value;
  return blogs.value.filter((b) => (selectedStatus.value === 'published' ? b.published : !b.published));
});

const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * limit + 1));
const rangeEnd = computed(() => Math.min(page.value * limit, total.value));

function formatDate(date: string | null): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function excerptPreview(excerpt: string | null): string {
  if (!excerpt) return '';
  return excerpt.length > 50 ? `${excerpt.substring(0, 50)}...` : excerpt;
}

async function loadStories() {
  loading.value = true;
  error.value = null;
  try {
    const res = await blogApi.getMyBlogs(page.value, limit);
    blogs.value = res.blogs;
    total.value = res.total;
    totalPages.value = res.totalPages;
  } catch (e: any) {
    error.value = e?.message ?? 'Failed to load your stories.';
  } finally {
    loading.value = false;
  }
}

function goToPage(next: number) {
  if (next < 1 || next > totalPages.value || next === page.value) return;
  page.value = next;
  loadStories();
}

async function handleDelete(id: string) {
  if (!confirm('Are you sure you want to delete this story?')) return;
  deleteError.value = null;
  deletingId.value = id;
  try {
    await blogApi.remove(id);
    blogs.value = blogs.value.filter((b) => b.id !== id);
    total.value = Math.max(0, total.value - 1);
  } catch (e: any) {
    deleteError.value = e?.message ?? 'Failed to delete the story.';
  } finally {
    deletingId.value = null;
  }
}

onMounted(loadStories);
</script>
