<template>
  <div class="min-h-screen bg-primary-50">
    <header class="bg-white shadow-sm">
      <div class="max-w-7xl mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold text-primary-900">Categories</h1>
        <p class="mt-2 text-lg text-primary-600">Browse stories by topic</p>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-12">
      <div v-if="error" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-8">
        {{ error }}
      </div>

      <div v-if="loading" class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div v-for="i in 6" :key="i" class="bg-white p-8 rounded-xl shadow-sm">
          <div class="w-12 h-12 bg-primary-100 rounded-lg animate-pulse mb-4"></div>
          <div class="h-6 w-2/3 bg-primary-100 animate-pulse rounded mb-2"></div>
          <div class="h-4 w-full bg-primary-100 animate-pulse rounded"></div>
        </div>
      </div>

      <div v-else-if="!error && categories.length === 0" class="text-center py-16 bg-white rounded-xl shadow-sm">
        <p class="text-lg text-primary-700">No categories have been created yet.</p>
      </div>

      <div v-else class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div v-for="category in categories" :key="category.id"
          class="bg-white p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div class="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
            <i :class="category.icon ?? 'ri-folder-line'" class="text-2xl text-primary-600"></i>
          </div>
          <h3 class="text-xl font-semibold text-primary-900 mb-2">{{ category.name }}</h3>
          <p v-if="category.description" class="text-primary-600 mb-4">{{ category.description }}</p>

          <div v-if="category.children?.length" class="flex flex-wrap gap-2 mb-4">
            <NuxtLink
              v-for="child in category.children"
              :key="child.id"
              :to="`/categories/${child.slug}`"
              class="px-3 py-1 bg-primary-50 text-primary-700 text-sm rounded-full hover:bg-primary-100"
            >
              {{ child.name }}
            </NuxtLink>
          </div>

          <div class="flex items-center justify-end">
            <NuxtLink :to="`/categories/${category.slug}`"
              class="text-primary-600 hover:text-primary-800 font-medium">
              Browse stories →
            </NuxtLink>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import type { Category } from '~/types/blog';
import type { ApiError } from '~/types/admin';

const blogApi = useBlogApi();

const categories = ref<Category[]>([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    // getCategories() returns the full flat+nested list; only top-level
    // categories (no parentId) are shown as cards, with their children
    // rendered as sub-tags underneath.
    const all = await blogApi.getCategories();
    categories.value = all.filter((c) => !c.parentId);
  } catch (err) {
    error.value = (err as ApiError)?.message ?? 'Failed to load categories.';
  } finally {
    loading.value = false;
  }
});
</script>
