<template>
  <div class="min-h-screen bg-primary-50">
    <div v-if="loadingCategory" class="max-w-7xl mx-auto px-4 py-12 space-y-4">
      <div class="h-8 w-1/3 bg-primary-100 animate-pulse rounded"></div>
      <div class="h-4 w-1/2 bg-primary-100 animate-pulse rounded"></div>
    </div>

    <div v-else-if="notFound" class="max-w-4xl mx-auto px-4 py-24 text-center">
      <h1 class="text-3xl font-bold text-primary-900 mb-4">Category not found</h1>
      <p class="text-primary-600 mb-8">This category may have been removed or never existed.</p>
      <NuxtLink to="/categories"
        class="inline-flex items-center px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors">
        Back to Categories
      </NuxtLink>
    </div>

    <div v-else-if="pageError" class="max-w-4xl mx-auto px-4 py-12">
      <div class="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
        {{ pageError }}
      </div>
    </div>

    <template v-else-if="category">
      <header class="bg-white shadow-sm">
        <div class="max-w-7xl mx-auto px-4 py-8">
          <h1 class="text-3xl font-bold text-primary-900">{{ category.name }}</h1>
          <p v-if="category.description" class="mt-2 text-lg text-primary-600">{{ category.description }}</p>
        </div>
      </header>

      <main class="max-w-7xl mx-auto px-4 py-12">
        <div v-if="category.children?.length" class="flex flex-wrap gap-4 mb-8">
          <NuxtLink v-for="child in category.children" :key="child.id" :to="`/categories/${child.slug}`"
            class="px-4 py-2 rounded-full bg-white shadow-sm hover:shadow-md transition-shadow text-primary-600 hover:text-primary-800">
            {{ child.name }}
          </NuxtLink>
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
          <p class="text-lg text-primary-700">No stories in this category yet.</p>
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
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Category, SearchBlogsResult } from '~/types/blog';
import type { ApiError } from '~/types/admin';

const route = useRoute();
const blogApi = useBlogApi();
const slug = route.params.slug as string;

const category = ref<Category | null>(null);
const loadingCategory = ref(true);
const notFound = ref(false);
const pageError = ref('');

const posts = ref<SearchBlogsResult['blogs']>([]);
const page = ref(1);
const totalPages = ref(1);
const initialLoading = ref(true);
const loadingMore = ref(false);
const error = ref('');

// There is no "get category by slug" endpoint - fetch the full (flat +
// one-level-nested) list and search both parents and their children for
// a slug match.
const findCategoryBySlug = (categories: Category[]): Category | null => {
  for (const cat of categories) {
    if (cat.slug === slug) return cat;
    const child = cat.children?.find((c) => c.slug === slug);
    if (child) return child;
  }
  return null;
};

const loadPosts = async (reset: boolean) => {
  if (!category.value) return;
  if (reset) {
    initialLoading.value = true;
  }
  error.value = '';
  try {
    const result = await blogApi.search({
      category: category.value.id,
      sortBy: 'recent',
      page: reset ? 1 : page.value + 1,
      limit: 12,
    });
    posts.value = reset ? result.blogs : [...posts.value, ...result.blogs];
    page.value = result.page;
    totalPages.value = result.totalPages;
  } catch (err) {
    error.value = (err as ApiError)?.message ?? 'Failed to load stories.';
  } finally {
    initialLoading.value = false;
    loadingMore.value = false;
  }
};

const loadMore = () => {
  if (loadingMore.value || page.value >= totalPages.value) return;
  loadingMore.value = true;
  loadPosts(false);
};

const formatDate = (date: string | null) => {
  if (!date) return 'Draft';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

onMounted(async () => {
  try {
    const all = await blogApi.getCategories();
    const found = findCategoryBySlug(all);
    if (!found) {
      notFound.value = true;
      return;
    }
    category.value = found;
    await loadPosts(true);
  } catch (err) {
    pageError.value = (err as ApiError)?.message ?? 'Failed to load this category.';
  } finally {
    loadingCategory.value = false;
  }
});
</script>
