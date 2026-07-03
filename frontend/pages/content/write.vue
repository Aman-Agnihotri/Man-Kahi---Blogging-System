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

        <div class="mb-2 flex space-x-2">
          <button
            type="button"
            @click="activeTab = 'write'"
            class="px-4 py-1.5 rounded-t-lg text-sm font-medium"
            :class="activeTab === 'write' ? 'bg-primary-100 text-primary-800' : 'text-primary-500 hover:text-primary-700'"
          >
            Write
          </button>
          <button
            type="button"
            @click="activeTab = 'preview'"
            class="px-4 py-1.5 rounded-t-lg text-sm font-medium"
            :class="activeTab === 'preview' ? 'bg-primary-100 text-primary-800' : 'text-primary-500 hover:text-primary-700'"
          >
            Preview
          </button>
        </div>

        <div v-if="activeTab === 'write'" class="mb-2">
          <textarea
            v-model="content"
            placeholder="Write your story in Markdown..."
            class="w-full h-96 p-4 rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500 font-mono text-sm"
          ></textarea>
        </div>
        <div
          v-else
          class="mb-2 h-96 overflow-y-auto p-4 rounded-lg border border-primary-200 prose prose-sm max-w-none"
        >
          <div v-if="content.trim()" v-html="previewHtml"></div>
          <p v-else class="text-primary-400">Nothing to preview yet.</p>
        </div>
        <p class="text-sm text-primary-500 mb-6">
          {{ content.length }}/100 characters minimum. Markdown supported.
        </p>

        <div class="mb-6 border border-primary-200 rounded-lg">
          <button
            type="button"
            @click="showSeoFields = !showSeoFields"
            class="w-full flex items-center justify-between px-4 py-3 text-left text-primary-700 font-medium"
          >
            <span>SEO settings (optional)</span>
            <span>{{ showSeoFields ? '−' : '+' }}</span>
          </button>
          <div v-if="showSeoFields" class="px-4 pb-4 space-y-4 border-t border-primary-100 pt-4">
            <div>
              <label class="block text-sm font-medium text-primary-700 mb-1">Meta title</label>
              <input
                v-model="metaTitle"
                type="text"
                maxlength="200"
                placeholder="Defaults to the post title"
                class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
              />
              <p class="text-xs text-primary-400 mt-1">{{ metaTitle.length }}/200 characters</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-primary-700 mb-1">Meta description</label>
              <textarea
                v-model="metaDescription"
                maxlength="1000"
                rows="3"
                placeholder="Shown in search engine results"
                class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
              ></textarea>
              <p class="text-xs text-primary-400 mt-1">{{ metaDescription.length }}/1000 characters</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-primary-700 mb-1">Canonical URL</label>
              <input
                v-model="canonicalUrl"
                type="url"
                placeholder="https://example.com/original-post"
                class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
              />
              <p class="text-xs text-primary-400 mt-1">Set this if this post was originally published elsewhere.</p>
            </div>
          </div>
        </div>

        <div v-if="editSlug" class="mb-6 border border-primary-200 rounded-lg">
          <button
            type="button"
            @click="toggleRevisions"
            class="w-full flex items-center justify-between px-4 py-3 text-left text-primary-700 font-medium"
          >
            <span>Version history</span>
            <span>{{ showRevisions ? '−' : '+' }}</span>
          </button>
          <div v-if="showRevisions" class="px-4 pb-4 border-t border-primary-100 pt-4">
            <div v-if="loadingRevisions" class="text-sm text-primary-500">Loading revisions...</div>
            <div v-else-if="revisionsError" class="text-sm text-red-600">{{ revisionsError }}</div>
            <div v-else-if="revisions.length === 0" class="text-sm text-primary-500">No earlier versions yet.</div>
            <ul v-else class="divide-y divide-primary-100">
              <li v-for="rev in revisions" :key="rev.id" class="py-3">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <button
                    type="button"
                    @click="viewRevision(rev.id)"
                    class="text-sm text-primary-700 hover:text-primary-900 font-medium"
                  >
                    Version {{ rev.version }} · {{ formatDateTime(rev.createdAt) }}
                  </button>
                  <button
                    type="button"
                    :disabled="restoringRevisionId === rev.id"
                    @click="restoreRevisionAndReload(rev.id)"
                    class="text-sm px-3 py-1 border-2 border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 disabled:opacity-50"
                  >
                    {{ restoringRevisionId === rev.id ? 'Restoring...' : 'Restore this version' }}
                  </button>
                </div>
                <div v-if="expandedRevisionId === rev.id" class="mt-2 p-3 bg-primary-50 rounded-lg text-sm">
                  <p v-if="loadingRevisionContent" class="text-primary-500">Loading...</p>
                  <pre v-else class="whitespace-pre-wrap font-mono text-xs text-primary-800">{{ expandedRevisionContent }}</pre>
                </div>
              </li>
            </ul>
          </div>
        </div>

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
import { marked } from 'marked';
import type { Blog, BlogRevisionSummary } from '~/types/blog';

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
// Mirrors `existingBlog.id` in a ref so the template/revisions code below can
// react to it (the `existingBlog` variable itself is intentionally plain,
// matching this file's existing convention of not making it reactive).
const existingBlogId = ref<string | null>(null);

// SEO metadata - optional, tucked behind the "SEO settings" disclosure below.
const metaTitle = ref('');
const metaDescription = ref('');
const canonicalUrl = ref('');
const showSeoFields = ref(false);

// Write/Preview tab for the markdown editor.
const activeTab = ref<'write' | 'preview'>('write');

/**
 * Client-side rendering for the Preview tab. This project has no
 * markdown-to-HTML rendering on the frontend otherwise - the backend
 * independently renders markdown to HTML via its own `processMarkdown`
 * pipeline when a post is saved (see post/[slug].vue, which just renders
 * the server-produced HTML with v-html). Using `marked` (already a
 * dependency here) client-side gives a close, but not guaranteed
 * pixel-identical, approximation of that server-side rendering - it is a
 * separate implementation/config from whatever the backend runs, so treat
 * this preview as "close enough while writing", not a byte-for-byte match.
 */
const previewHtml = computed(() => marked.parse(content.value, { async: false }) as string);

// --- Version history (edit mode only) -------------------------------------

const showRevisions = ref(false);
const revisions = ref<BlogRevisionSummary[]>([]);
const loadingRevisions = ref(false);
const revisionsError = ref('');
const expandedRevisionId = ref<string | null>(null);
const expandedRevisionContent = ref<string | null>(null);
const loadingRevisionContent = ref(false);
const restoringRevisionId = ref<string | null>(null);

function formatDateTime(date: string) {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function toggleRevisions() {
  showRevisions.value = !showRevisions.value;
  if (!showRevisions.value || !existingBlogId.value || revisions.value.length > 0) return;

  loadingRevisions.value = true;
  revisionsError.value = '';
  try {
    revisions.value = await blogApi.getRevisions(existingBlogId.value);
  } catch (error) {
    revisionsError.value = normalizeApiError(error).message;
  } finally {
    loadingRevisions.value = false;
  }
}

async function viewRevision(revisionId: string) {
  if (expandedRevisionId.value === revisionId) {
    expandedRevisionId.value = null;
    return;
  }
  expandedRevisionId.value = revisionId;
  if (!existingBlogId.value) return;

  loadingRevisionContent.value = true;
  expandedRevisionContent.value = null;
  try {
    const revision = await blogApi.getRevision(existingBlogId.value, revisionId);
    // Prefer the raw markdown snapshot - revisions captured before it
    // existed only have the rendered HTML, shown here as a fallback.
    expandedRevisionContent.value = revision.contentMarkdown ?? revision.content;
  } catch (error) {
    expandedRevisionContent.value = `Failed to load this revision: ${normalizeApiError(error).message}`;
  } finally {
    loadingRevisionContent.value = false;
  }
}

/** Restores a past revision, then reloads its content straight into the editor so the change is visible immediately. */
async function restoreRevisionAndReload(revisionId: string) {
  if (!existingBlogId.value) return;

  restoringRevisionId.value = revisionId;
  revisionsError.value = '';
  try {
    const restored = await blogApi.restoreRevision(existingBlogId.value, revisionId);
    existingBlog = restored;
    title.value = restored.title;
    content.value = restored.contentMarkdown ?? restored.content;
    tags.value = restored.tags.map((t) => t.tag.name);
    metaTitle.value = restored.metaTitle ?? '';
    metaDescription.value = restored.metaDescription ?? '';
    canonicalUrl.value = restored.canonicalUrl ?? '';
    expandedRevisionId.value = null;
    // The restore itself creates a new revision entry, so refresh the list.
    revisions.value = await blogApi.getRevisions(existingBlogId.value);
  } catch (error) {
    revisionsError.value = normalizeApiError(error).message;
  } finally {
    restoringRevisionId.value = null;
  }
}

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
    existingBlogId.value = found.id;
    title.value = found.title;
    // Prefer the raw markdown source - posts saved before this field
    // existed fall back to the rendered HTML (best effort; re-saving will
    // populate contentMarkdown going forward).
    content.value = found.contentMarkdown ?? found.content;
    tags.value = found.tags.map((t) => t.tag.name);
    metaTitle.value = found.metaTitle ?? '';
    metaDescription.value = found.metaDescription ?? '';
    canonicalUrl.value = found.canonicalUrl ?? '';
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
      metaTitle: metaTitle.value.trim() || undefined,
      metaDescription: metaDescription.value.trim() || undefined,
      canonicalUrl: canonicalUrl.value.trim() || undefined,
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
