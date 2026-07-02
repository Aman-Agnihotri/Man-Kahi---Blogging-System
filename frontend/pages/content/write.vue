<template>
  <div class="min-h-screen bg-white">
    <div class="max-w-4xl mx-auto px-4 py-8">
      <div v-if="loadingExisting" class="animate-pulse space-y-4">
        <div class="h-12 bg-primary-100 rounded w-2/3"></div>
        <div class="h-64 bg-primary-100 rounded"></div>
      </div>

      <template v-else>
        <div class="mb-8">
          <input
            v-model="title"
            type="text"
            placeholder="Title"
            class="w-full text-4xl font-bold focus:outline-none"
          />
        </div>

        <div class="mb-6 flex-1 flex space-x-2">
          <input
            v-model="newTag"
            type="text"
            placeholder="Add a tag"
            class="flex-1 rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
            @keyup.enter="addTag"
          />
          <button
            type="button"
            @click="addTag"
            class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Add
          </button>
        </div>

        <div class="mb-6 flex flex-wrap gap-2">
          <span
            v-for="tag in tags"
            :key="tag"
            class="px-3 py-1 bg-primary-100 text-primary-700 rounded-full flex items-center"
          >
            {{ tag }}
            <button type="button" @click="removeTag(tag)" class="ml-2 text-primary-500 hover:text-primary-700">
              ×
            </button>
          </span>
        </div>

        <div class="mb-2">
          <textarea
            v-model="content"
            placeholder="Write your story in Markdown..."
            class="w-full h-96 p-4 rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500 font-mono text-sm"
          ></textarea>
        </div>
        <p class="text-sm text-primary-500 mb-6">
          {{ content.length }}/100 characters minimum. Markdown supported.
        </p>

        <div v-if="errorMessage" class="mb-6 bg-red-50 text-red-700 p-3 rounded-lg text-sm">
          {{ errorMessage }}
        </div>

        <div class="flex justify-between items-center">
          <button
            type="button"
            :disabled="saving"
            @click="save(false)"
            class="px-6 py-2 border-2 border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 disabled:opacity-50"
          >
            {{ saving && !publishOnSave ? 'Saving...' : 'Save Draft' }}
          </button>

          <button
            type="button"
            :disabled="saving"
            @click="save(true)"
            class="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {{ saving && publishOnSave ? 'Publishing...' : 'Publish' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Blog } from '~/types/blog';

definePageMeta({ requiresAuth: true });

const route = useRoute();
const router = useRouter();
const blogApi = useBlogApi();

// `edit` is the blog's slug (not id): getBySlug already allows an author to
// fetch their own unpublished draft by slug, which is far simpler than
// paging through every one of the user's blogs to find one by id.
const editSlug = computed(() => (typeof route.query.edit === 'string' ? route.query.edit : null));

const title = ref('');
const content = ref('');
const newTag = ref('');
const tags = ref<string[]>([]);
const errorMessage = ref('');
const saving = ref(false);
const publishOnSave = ref(false);
const loadingExisting = ref(false);
let existingBlog: Blog | null = null;

// Fetched client-side only (onMounted, not a top-level await): this page's
// data depends on the auth token, which is only available in the browser
// (restored from localStorage), so there is nothing meaningful to render
// during SSR here.
onMounted(async () => {
  if (!editSlug.value) return;

  loadingExisting.value = true;
  try {
    const found = await blogApi.getBySlug(editSlug.value);
    existingBlog = found;
    title.value = found.title;
    content.value = found.content;
    tags.value = found.tags.map((t) => t.tag.name);
  } catch {
    errorMessage.value = 'Story not found, or you do not have permission to edit it.';
  } finally {
    loadingExisting.value = false;
  }
});

function addTag() {
  const value = newTag.value.trim();
  if (value && !tags.value.includes(value)) {
    tags.value.push(value);
  }
  newTag.value = '';
}

function removeTag(tag: string) {
  tags.value = tags.value.filter((t) => t !== tag);
}

/**
 * The backend requires the markdown body to contain a top-level `# Heading`
 * (separately from the `title` field) or it rejects the post as "Invalid
 * markdown content". Rather than surface that as a confusing error, ensure
 * the body always starts with one derived from the title field.
 */
function contentWithTitleHeading(): string {
  const trimmed = content.value.trimStart();
  if (/^#\s+.+/m.test(trimmed)) {
    return content.value;
  }
  return `# ${title.value}\n\n${content.value}`;
}

async function save(publish: boolean) {
  errorMessage.value = '';

  if (!title.value.trim()) {
    errorMessage.value = 'Please add a title.';
    return;
  }
  if (content.value.trim().length < 100) {
    errorMessage.value = 'Content must be at least 100 characters.';
    return;
  }

  saving.value = true;
  publishOnSave.value = publish;

  try {
    const input = {
      title: title.value.trim(),
      content: contentWithTitleHeading(),
      tags: tags.value,
      published: publish,
    };

    const saved = existingBlog
      ? await blogApi.update(existingBlog.id, input)
      : await blogApi.create(input);

    await router.push(publish ? `/post/${saved.slug}` : '/user/stories');
  } catch (error: any) {
    errorMessage.value = normalizeApiError(error).message;
  } finally {
    saving.value = false;
  }
}
</script>
