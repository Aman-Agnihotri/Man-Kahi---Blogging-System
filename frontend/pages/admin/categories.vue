<template>
  <div class="min-h-screen bg-primary-50">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <h1 class="text-3xl font-bold text-primary-900 mb-8">Categories</h1>

      <!-- Nav -->
      <div class="flex flex-wrap gap-2 mb-8">
        <NuxtLink
          to="/admin/dashboard"
          class="px-4 py-2 rounded-full text-sm font-medium bg-white text-primary-700 hover:bg-primary-100"
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
          class="px-4 py-2 rounded-full text-sm font-medium bg-primary-600 text-white"
        >
          Categories
        </NuxtLink>
      </div>

      <div v-if="listError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
        {{ listError }}
      </div>
      <div v-if="actionError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
        {{ actionError }}
      </div>

      <!-- Create form -->
      <div class="bg-white rounded-xl shadow-sm p-6 mb-8">
        <h2 class="text-lg font-semibold text-primary-900 mb-4">
          {{ editingId ? 'Edit category' : 'New category' }}
        </h2>
        <form class="grid grid-cols-1 md:grid-cols-2 gap-4" @submit.prevent="handleSubmit">
          <div>
            <label class="block text-sm font-medium text-primary-700 mb-1">Name</label>
            <input
              v-model="form.name"
              type="text"
              required
              class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-primary-700 mb-1">Parent category (optional)</label>
            <select
              v-model="form.parentId"
              class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
            >
              <option value="">None (top-level)</option>
              <option v-for="cat in topLevelCategories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-primary-700 mb-1">Description (optional)</label>
            <textarea
              v-model="form.description"
              rows="2"
              class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
            ></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-primary-700 mb-1">Icon (optional)</label>
            <input
              v-model="form.icon"
              type="text"
              placeholder="e.g. ri-code-line"
              class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-primary-700 mb-1">Color (optional)</label>
            <input
              v-model="form.color"
              type="text"
              placeholder="e.g. #4F46E5"
              class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
            />
          </div>

          <div class="md:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              :disabled="submitting"
              class="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {{ submitting ? 'Saving...' : (editingId ? 'Save changes' : 'Create category') }}
            </button>
            <button
              v-if="editingId"
              type="button"
              class="px-6 py-2 border border-primary-200 rounded-lg hover:bg-primary-50"
              @click="cancelEdit"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      <!-- List -->
      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <div v-if="listLoading" class="p-6 space-y-4">
          <div v-for="i in 4" :key="i" class="h-10 w-full bg-primary-200 animate-pulse rounded"></div>
        </div>

        <div v-else-if="!categories.length" class="p-12 text-center text-primary-600">
          No categories yet.
        </div>

        <ul v-else class="divide-y divide-primary-200">
          <template v-for="cat in categories" :key="cat.id">
            <li class="px-6 py-4 flex items-center justify-between">
              <div>
                <div class="text-sm font-medium text-primary-900">{{ cat.name }}</div>
                <div v-if="cat.description" class="text-xs text-primary-500">{{ cat.description }}</div>
              </div>
              <div class="space-x-3 text-sm font-medium">
                <button class="text-primary-600 hover:text-primary-900" @click="startEdit(cat)">Edit</button>
                <button
                  class="text-red-600 hover:text-red-900 disabled:opacity-50"
                  :disabled="deletingId === cat.id"
                  @click="handleDelete(cat)"
                >
                  Delete
                </button>
              </div>
            </li>
            <li
              v-for="child in cat.children"
              :key="child.id"
              class="px-6 py-4 pl-12 flex items-center justify-between bg-primary-50/50"
            >
              <div>
                <div class="text-sm font-medium text-primary-900">{{ child.name }}</div>
                <div v-if="child.description" class="text-xs text-primary-500">{{ child.description }}</div>
              </div>
              <div class="space-x-3 text-sm font-medium">
                <button class="text-primary-600 hover:text-primary-900" @click="startEdit(child)">Edit</button>
                <button
                  class="text-red-600 hover:text-red-900 disabled:opacity-50"
                  :disabled="deletingId === child.id"
                  @click="handleDelete(child)"
                >
                  Delete
                </button>
              </div>
            </li>
          </template>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Category } from '~/types/blog';

definePageMeta({ requiresAuth: true, requiresAdmin: true });

const blogApi = useBlogApi();

const categories = ref<Category[]>([]);
const listLoading = ref(true);
const listError = ref<string | null>(null);

const actionError = ref<string | null>(null);
const submitting = ref(false);
const deletingId = ref<string | null>(null);
const editingId = ref<string | null>(null);

const form = reactive({
  name: '',
  description: '',
  parentId: '',
  icon: '',
  color: '',
});

// Only top-level categories can be picked as a parent - this backend/UI
// only ever renders one level of nesting (see categories/index.vue).
const topLevelCategories = computed(() => categories.value.filter((c) => !c.parentId && c.id !== editingId.value));

function resetForm() {
  form.name = '';
  form.description = '';
  form.parentId = '';
  form.icon = '';
  form.color = '';
  editingId.value = null;
}

function startEdit(cat: Category) {
  actionError.value = null;
  editingId.value = cat.id;
  form.name = cat.name;
  form.description = cat.description ?? '';
  form.parentId = cat.parentId ?? '';
  form.icon = cat.icon ?? '';
  form.color = cat.color ?? '';
}

function cancelEdit() {
  resetForm();
}

async function loadCategories() {
  listLoading.value = true;
  listError.value = null;
  try {
    categories.value = await blogApi.getCategories();
  } catch (e: any) {
    listError.value = e?.message ?? 'Failed to load categories.';
  } finally {
    listLoading.value = false;
  }
}

async function handleSubmit() {
  actionError.value = null;
  submitting.value = true;
  try {
    const input = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      parentId: form.parentId || undefined,
      icon: form.icon.trim() || undefined,
      color: form.color.trim() || undefined,
    };

    if (editingId.value) {
      await blogApi.updateCategory(editingId.value, input);
    } else {
      await blogApi.createCategory(input);
    }
    resetForm();
    await loadCategories();
  } catch (e: any) {
    actionError.value = e?.message ?? 'Failed to save category.';
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(cat: Category) {
  actionError.value = null;
  deletingId.value = cat.id;
  try {
    await blogApi.deleteCategory(cat.id);
    if (editingId.value === cat.id) {
      resetForm();
    }
    await loadCategories();
  } catch (e: any) {
    actionError.value = e?.message ?? 'Failed to delete category.';
  } finally {
    deletingId.value = null;
  }
}

onMounted(() => {
  loadCategories();
});
</script>
