<template>
  <div class="min-h-screen bg-primary-50">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <h1 class="text-3xl font-bold text-primary-900 mb-8">Admin Dashboard</h1>

      <!-- Nav -->
      <div class="flex flex-wrap gap-2 mb-8">
        <NuxtLink
          to="/admin/dashboard"
          class="px-4 py-2 rounded-full text-sm font-medium bg-primary-600 text-white"
        >
          Dashboard
        </NuxtLink>
        <NuxtLink
          to="/admin/users"
          class="px-4 py-2 rounded-full text-sm font-medium bg-white text-primary-700 hover:bg-primary-100"
        >
          Users
        </NuxtLink>
        <NuxtLink
          to="/admin/reports"
          class="px-4 py-2 rounded-full text-sm font-medium bg-white text-primary-700 hover:bg-primary-100"
        >
          Reports
        </NuxtLink>
        <NuxtLink
          to="/admin/audit-log"
          class="px-4 py-2 rounded-full text-sm font-medium bg-white text-primary-700 hover:bg-primary-100"
        >
          Audit Log
        </NuxtLink>
        <NuxtLink
          to="/admin/categories"
          class="px-4 py-2 rounded-full text-sm font-medium bg-white text-primary-700 hover:bg-primary-100"
        >
          Categories
        </NuxtLink>
      </div>

      <div v-if="statsError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
        {{ statsError }}
      </div>

      <!-- Stats -->
      <div v-if="statsLoading" class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
        <div v-for="i in 5" :key="i" class="bg-white p-6 rounded-xl shadow-sm">
          <div class="h-4 w-24 bg-primary-200 animate-pulse rounded mb-4"></div>
          <div class="h-8 w-16 bg-primary-200 animate-pulse rounded"></div>
        </div>
      </div>

      <div v-else-if="stats" class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
        <div class="bg-white p-6 rounded-xl shadow-sm">
          <h3 class="text-lg font-semibold text-primary-900 mb-2">Total Blogs</h3>
          <p class="text-3xl font-bold text-primary-600">{{ stats.totalBlogs }}</p>
        </div>
        <div class="bg-white p-6 rounded-xl shadow-sm">
          <h3 class="text-lg font-semibold text-primary-900 mb-2">Total Users</h3>
          <p class="text-3xl font-bold text-primary-600">{{ stats.totalUsers }}</p>
        </div>
        <div class="bg-white p-6 rounded-xl shadow-sm">
          <h3 class="text-lg font-semibold text-primary-900 mb-2">Views</h3>
          <p class="text-3xl font-bold text-primary-600">{{ stats.analytics.views }}</p>
        </div>
        <div class="bg-white p-6 rounded-xl shadow-sm">
          <h3 class="text-lg font-semibold text-primary-900 mb-2">Reads</h3>
          <p class="text-3xl font-bold text-primary-600">{{ stats.analytics.reads }}</p>
        </div>
        <div class="bg-white p-6 rounded-xl shadow-sm">
          <h3 class="text-lg font-semibold text-primary-900 mb-2">Avg Engagement</h3>
          <p class="text-3xl font-bold text-primary-600">{{ stats.analytics.avgEngagement.toFixed(1) }}</p>
        </div>
      </div>

      <!-- Search -->
      <h2 class="text-2xl font-bold text-primary-900 mb-6">Search</h2>

      <div class="bg-white p-6 rounded-xl shadow-sm mb-10">
        <h3 class="text-lg font-semibold text-primary-900 mb-2">Rebuild search index</h3>
        <p class="text-sm text-primary-600 mb-4">Reindex all blogs into Elasticsearch. Runs in the background.</p>
        <button
          class="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="reindexing"
          @click="handleReindex"
        >
          {{ reindexing ? 'Rebuilding…' : 'Rebuild search index' }}
        </button>
        <p
          v-if="reindexNotice"
          :class="{
            'p-3 rounded-lg text-sm mt-4': true,
            'bg-green-50 text-green-700': reindexNotice.tone === 'success',
            'bg-amber-50 text-amber-700': reindexNotice.tone === 'warn',
            'bg-red-50 text-red-700': reindexNotice.tone === 'error'
          }"
        >
          {{ reindexNotice.text }}
        </p>
      </div>

      <!-- Moderation -->
      <h2 class="text-2xl font-bold text-primary-900 mb-6">Blog Moderation</h2>

      <div v-if="listError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
        {{ listError }}
      </div>
      <div v-if="toggleError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
        {{ toggleError }}
      </div>

      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <div v-if="listLoading" class="p-6 space-y-4">
          <div v-for="i in 5" :key="i" class="h-10 w-full bg-primary-200 animate-pulse rounded"></div>
        </div>

        <div v-else-if="!blogs.length" class="p-12 text-center text-primary-600">
          No blogs found.
        </div>

        <table v-else class="min-w-full divide-y divide-primary-200">
          <thead class="bg-primary-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Title
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Author
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Status
              </th>
              <th class="px-6 py-3 text-right text-xs font-medium text-primary-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-primary-200">
            <tr v-for="blog in blogs" :key="blog.id">
              <td class="px-6 py-4">
                <div class="text-sm font-medium text-primary-900">{{ blog.title }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-primary-600">
                {{ blog.author?.username ?? 'Unknown' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="{
                  'px-2 py-1 text-xs font-medium rounded-full': true,
                  'bg-green-100 text-green-800': blog.published,
                  'bg-yellow-100 text-yellow-800': !blog.published
                }">
                  {{ blog.published ? 'Published' : 'Hidden' }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button
                  class="text-primary-600 hover:text-primary-900 disabled:opacity-50"
                  :disabled="togglingId === blog.id"
                  @click="handleToggleVisibility(blog)"
                >
                  {{ blog.published ? 'Hide' : 'Publish' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="!listLoading && blogs.length" class="px-6 py-4 border-t border-primary-200">
          <div class="flex items-center justify-between">
            <p class="text-sm text-primary-500">
              Showing {{ rangeStart }}-{{ rangeEnd }} of {{ total }} blogs
            </p>
            <div class="flex space-x-2">
              <button
                class="px-3 py-1 border border-primary-200 rounded hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="page <= 1 || listLoading"
                @click="goToPage(page - 1)"
              >
                Previous
              </button>
              <button
                class="px-3 py-1 border border-primary-200 rounded hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="page >= totalPages || listLoading"
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
import type { DashboardStats } from '~/types/admin';

definePageMeta({ requiresAuth: true, requiresAdmin: true });

const adminApi = useAdminApi();
const api = useApi();

const stats = ref<DashboardStats | null>(null);
const statsLoading = ref(true);
const statsError = ref<string | null>(null);

const limit = 10;
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const blogs = ref<Blog[]>([]);
const listLoading = ref(true);
const listError = ref<string | null>(null);

const togglingId = ref<string | null>(null);
const toggleError = ref<string | null>(null);

const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * limit + 1));
const rangeEnd = computed(() => Math.min(page.value * limit, total.value));

async function loadStats() {
  statsLoading.value = true;
  statsError.value = null;
  try {
    stats.value = await adminApi.getDashboardStats();
  } catch (e: any) {
    statsError.value = e?.message ?? 'Failed to load dashboard stats.';
  } finally {
    statsLoading.value = false;
  }
}

async function loadBlogs() {
  listLoading.value = true;
  listError.value = null;
  try {
    const res = await adminApi.listBlogs(page.value, limit);
    blogs.value = res.blogs;
    total.value = res.total;
    totalPages.value = res.totalPages;
  } catch (e: any) {
    listError.value = e?.message ?? 'Failed to load blogs.';
  } finally {
    listLoading.value = false;
  }
}

function goToPage(next: number) {
  if (next < 1 || next > totalPages.value || next === page.value) return;
  page.value = next;
  loadBlogs();
}

async function handleToggleVisibility(blog: Blog) {
  toggleError.value = null;
  togglingId.value = blog.id;
  try {
    const updated = await adminApi.setBlogVisibility(blog.id, !blog.published);
    const target = blogs.value.find((b) => b.id === blog.id);
    if (target) target.published = updated.published;
  } catch (e: any) {
    toggleError.value = e?.message ?? 'Failed to update blog visibility.';
  } finally {
    togglingId.value = null;
  }
}

onMounted(() => {
  loadStats();
  loadBlogs();
});

const reindexing = ref(false);
const reindexNotice = ref<{ tone: 'success' | 'warn' | 'error'; text: string } | null>(null);

async function handleReindex() {
  reindexing.value = true;
  reindexNotice.value = null;
  try {
    await api.post('/api/blogs/search/reindex');
    reindexNotice.value = { tone: 'success', text: 'Search index rebuild started — runs in the background.' };
  } catch (e: any) {
    if (e?.status === 409) {
      reindexNotice.value = { tone: 'warn', text: 'A rebuild is already running.' };
    } else if (e?.status === 503) {
      reindexNotice.value = { tone: 'error', text: 'Search is unavailable right now — is Elasticsearch up?' };
    } else {
      reindexNotice.value = { tone: 'error', text: 'Could not start the rebuild. Please try again.' };
    }
  } finally {
    reindexing.value = false;
  }
}
</script>
