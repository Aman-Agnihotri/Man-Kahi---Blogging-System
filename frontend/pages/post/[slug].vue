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
      <article ref="articleEl" class="max-w-4xl mx-auto px-4 py-12">
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

              <button v-if="showFollowButton" @click="toggleFollow" :disabled="followLoading"
                class="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                :class="isFollowing
                  ? 'border-2 border-primary-200 text-primary-700 hover:bg-primary-50'
                  : 'bg-primary-600 text-white hover:bg-primary-700'">
                {{ followLoading ? '...' : (isFollowing ? 'Following' : 'Follow') }}
              </button>
            </div>

            <div class="flex items-center space-x-4 text-primary-600">
              <button @click="toggleBookmark" :disabled="bookmarkLoading"
                class="flex items-center space-x-2 hover:text-primary-800 disabled:opacity-50"
                :class="bookmarked ? 'text-primary-800' : ''">
                <i :class="bookmarked ? 'ri-bookmark-fill' : 'ri-bookmark-line'" class="text-xl"></i>
                <span>{{ bookmarked ? 'Saved' : 'Save' }}</span>
              </button>
              <button @click="sharePost" class="flex items-center space-x-2 hover:text-primary-800">
                <i class="ri-share-line text-xl"></i>
                <span>Share</span>
              </button>
              <button v-if="showReportPostButton" @click="openReport('blog', post.id)" title="Report this post"
                class="flex items-center space-x-2 hover:text-red-600">
                <i class="ri-flag-line text-xl"></i>
                <span>Report</span>
              </button>
            </div>
          </div>

          <div v-if="actionError" class="mt-4 bg-red-50 text-red-700 p-3 rounded-lg text-sm">
            {{ actionError }}
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
              <button @click="toggleLike" :disabled="likeLoading"
                class="flex items-center space-x-2 hover:text-red-600 disabled:opacity-50"
                :class="liked ? 'text-red-600' : 'text-primary-600'">
                <i :class="liked ? 'ri-heart-fill' : 'ri-heart-line'" class="text-xl"></i>
                <span>{{ likesCount }}</span>
              </button>
              <a href="#comments" class="flex items-center space-x-2 text-primary-600 hover:text-primary-800">
                <i class="ri-chat-1-line text-xl"></i>
                <span>{{ commentsTotal }}</span>
              </a>
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

      <div id="comments" class="max-w-4xl mx-auto px-4 py-12 border-t border-primary-200">
        <h2 class="text-2xl font-bold text-primary-900 mb-8">Comments ({{ commentsTotal }})</h2>

        <div v-if="commentsError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
          {{ commentsError }}
        </div>

        <div v-if="auth.isAuthenticated" class="mb-8">
          <textarea v-model="newCommentContent" rows="3" placeholder="Share your thoughts..."
            class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"></textarea>
          <div class="mt-2 flex justify-end">
            <button @click="submitComment" :disabled="submittingComment || !newCommentContent.trim()"
              class="px-5 py-2 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {{ submittingComment ? 'Posting...' : 'Post Comment' }}
            </button>
          </div>
        </div>
        <div v-else class="mb-8 bg-white rounded-xl shadow-sm p-6 text-center text-primary-600">
          <NuxtLink to="/auth/login" class="text-primary-700 font-medium hover:underline">Sign in</NuxtLink>
          to join the discussion.
        </div>

        <div v-if="commentsLoading" class="space-y-6">
          <div v-for="i in 3" :key="i" class="flex space-x-3">
            <div class="w-10 h-10 rounded-full bg-primary-100 animate-pulse"></div>
            <div class="flex-1 space-y-2">
              <div class="h-4 w-1/4 bg-primary-100 animate-pulse rounded"></div>
              <div class="h-4 w-3/4 bg-primary-100 animate-pulse rounded"></div>
            </div>
          </div>
        </div>

        <div v-else-if="comments.length === 0" class="text-center py-12 bg-white rounded-xl shadow-sm text-primary-600">
          No comments yet — be the first to share your thoughts.
        </div>

        <div v-else class="space-y-8">
          <div v-for="comment in comments" :key="comment.id">
            <div class="flex space-x-3">
              <img v-if="comment.user.profileImage" :src="comment.user.profileImage" :alt="comment.user.username"
                class="w-10 h-10 rounded-full object-cover">
              <span v-else
                class="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold uppercase">
                {{ comment.user.username?.charAt(0) ?? '?' }}
              </span>
              <div class="flex-1">
                <div class="flex items-center space-x-2">
                  <p class="font-medium text-primary-900">{{ comment.user.username }}</p>
                  <p class="text-xs text-primary-500">{{ formatDate(comment.createdAt) }}</p>
                </div>

                <div v-if="editingCommentId === comment.id">
                  <textarea v-model="editContent" rows="2"
                    class="w-full mt-1 rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500 text-sm"></textarea>
                  <div class="mt-1 flex space-x-3">
                    <button @click="saveEdit(comment)" :disabled="savingEdit || !editContent.trim()"
                      class="text-sm text-primary-600 font-medium hover:text-primary-800 disabled:opacity-50">
                      Save
                    </button>
                    <button @click="cancelEdit" class="text-sm text-primary-500 hover:text-primary-700">Cancel</button>
                  </div>
                </div>
                <p v-else class="text-primary-700 mt-1">{{ comment.content }}</p>

                <div class="mt-2 flex items-center space-x-4 text-sm text-primary-500">
                  <button @click="startReply(comment.id)" class="hover:text-primary-800">Reply</button>
                  <button v-if="canEdit(comment)" @click="startEdit(comment)" class="hover:text-primary-800">Edit</button>
                  <button v-if="canDelete(comment)" @click="deleteCommentAction(comment)"
                    :disabled="deletingCommentId === comment.id" class="hover:text-red-600 disabled:opacity-50">
                    Delete
                  </button>
                  <button v-if="canReport(comment)" @click="openReport('comment', comment.id)"
                    class="hover:text-red-600">
                    Report
                  </button>
                </div>

                <div v-if="replyingToId === comment.id" class="mt-3">
                  <textarea v-model="replyContent" rows="2" placeholder="Write a reply..."
                    class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500 text-sm"></textarea>
                  <div class="mt-1 flex justify-end space-x-3">
                    <button @click="startReply(comment.id)" class="text-sm text-primary-500 hover:text-primary-700">
                      Cancel
                    </button>
                    <button @click="submitReply(comment.id)" :disabled="submittingReply || !replyContent.trim()"
                      class="text-sm px-4 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                      {{ submittingReply ? 'Posting...' : 'Reply' }}
                    </button>
                  </div>
                </div>

                <div v-if="comment.replies?.length" class="mt-4 ml-2 space-y-4 border-l-2 border-primary-100 pl-4">
                  <div v-for="reply in comment.replies" :key="reply.id" class="flex space-x-3">
                    <img v-if="reply.user.profileImage" :src="reply.user.profileImage" :alt="reply.user.username"
                      class="w-8 h-8 rounded-full object-cover">
                    <span v-else
                      class="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold uppercase">
                      {{ reply.user.username?.charAt(0) ?? '?' }}
                    </span>
                    <div class="flex-1">
                      <div class="flex items-center space-x-2">
                        <p class="font-medium text-primary-900 text-sm">{{ reply.user.username }}</p>
                        <p class="text-xs text-primary-500">{{ formatDate(reply.createdAt) }}</p>
                      </div>

                      <div v-if="editingCommentId === reply.id">
                        <textarea v-model="editContent" rows="2"
                          class="w-full mt-1 rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500 text-sm"></textarea>
                        <div class="mt-1 flex space-x-3">
                          <button @click="saveEdit(reply)" :disabled="savingEdit || !editContent.trim()"
                            class="text-sm text-primary-600 font-medium hover:text-primary-800 disabled:opacity-50">
                            Save
                          </button>
                          <button @click="cancelEdit" class="text-sm text-primary-500 hover:text-primary-700">
                            Cancel
                          </button>
                        </div>
                      </div>
                      <p v-else class="text-primary-700 text-sm mt-1">{{ reply.content }}</p>

                      <div class="mt-1 flex items-center space-x-4 text-xs text-primary-500">
                        <button v-if="canEdit(reply)" @click="startEdit(reply)" class="hover:text-primary-800">
                          Edit
                        </button>
                        <button v-if="canDelete(reply)" @click="deleteCommentAction(reply, comment.id)"
                          :disabled="deletingCommentId === reply.id" class="hover:text-red-600 disabled:opacity-50">
                          Delete
                        </button>
                        <button v-if="canReport(reply)" @click="openReport('comment', reply.id)"
                          class="hover:text-red-600">
                          Report
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!commentsLoading && comments.length > 0 && commentsPage < commentsTotalPages"
          class="mt-8 flex justify-center">
          <button @click="loadMoreComments" :disabled="commentsLoadingMore"
            class="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {{ commentsLoadingMore ? 'Loading...' : 'Load More Comments' }}
          </button>
        </div>
      </div>

      <div v-if="reportTarget" class="fixed bottom-6 right-6 z-50 bg-white rounded-xl shadow-lg border border-primary-200 p-4 w-80">
        <p class="font-medium text-primary-900 mb-2">
          Report this {{ reportTarget.type === 'blog' ? 'post' : 'comment' }}
        </p>
        <textarea v-model="reportReason" rows="3" placeholder="Why are you reporting this?"
          class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500 text-sm mb-2"></textarea>
        <div v-if="reportError" class="text-red-600 text-xs mb-2">{{ reportError }}</div>
        <div class="flex justify-end space-x-2">
          <button type="button" @click="closeReport" class="px-3 py-1 text-sm text-primary-600 hover:text-primary-800">
            Cancel
          </button>
          <button type="button" @click="submitReport" :disabled="reportSubmitting || !reportReason.trim()"
            class="px-3 py-1 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {{ reportSubmitting ? 'Submitting...' : 'Submit' }}
          </button>
        </div>
      </div>

      <div v-if="shareMessage" class="fixed bottom-6 left-6 z-50 bg-primary-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
        {{ shareMessage }}
      </div>
      <div v-if="reportSuccessMessage" class="fixed bottom-6 right-6 z-50 bg-primary-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
        {{ reportSuccessMessage }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Blog, Comment } from '~/types/blog'
import { tagNames } from '~/types/blog'
import type { ApiError } from '~/types/admin'

const route = useRoute()
const slug = route.params.slug as string
const blogApi = useBlogApi()
const profileApi = useProfileApi()
const auth = useAuthStore()

const post = ref<Blog | null>(null)
const relatedPosts = ref<Blog[]>([])
const loading = ref(true)
const notFound = ref(false)
const error = ref('')
const actionError = ref('')

const articleEl = ref<HTMLElement | null>(null)

// --- Follow -------------------------------------------------------------

const isFollowing = ref(false)
const followLoading = ref(false)

const showFollowButton = computed(() =>
  !!post.value && auth.isAuthenticated && auth.user?.id !== post.value.authorId
)

const toggleFollow = async () => {
  if (!post.value) return
  followLoading.value = true
  actionError.value = ''
  try {
    const result = isFollowing.value
      ? await profileApi.unfollow(post.value.authorId)
      : await profileApi.follow(post.value.authorId)
    isFollowing.value = result.following
  } catch (err) {
    actionError.value = (err as ApiError)?.message ?? 'Failed to update follow status.'
  } finally {
    followLoading.value = false
  }
}

// --- Like / bookmark ------------------------------------------------------

const liked = ref(false)
const likesCount = ref(0)
const likeLoading = ref(false)
const bookmarked = ref(false)
const bookmarkLoading = ref(false)

const toggleLike = async () => {
  if (!post.value) return
  if (!auth.isAuthenticated) {
    await navigateTo('/auth/login')
    return
  }
  likeLoading.value = true
  actionError.value = ''
  try {
    const result = liked.value ? await blogApi.unlike(post.value.id) : await blogApi.like(post.value.id)
    liked.value = result.liked
    likesCount.value = result.likesCount
  } catch (err) {
    actionError.value = (err as ApiError)?.message ?? 'Failed to update like.'
  } finally {
    likeLoading.value = false
  }
}

const toggleBookmark = async () => {
  if (!post.value) return
  if (!auth.isAuthenticated) {
    await navigateTo('/auth/login')
    return
  }
  bookmarkLoading.value = true
  actionError.value = ''
  try {
    const result = bookmarked.value
      ? await blogApi.unbookmark(post.value.id)
      : await blogApi.bookmark(post.value.id)
    bookmarked.value = result.bookmarked
  } catch (err) {
    actionError.value = (err as ApiError)?.message ?? 'Failed to update bookmark.'
  } finally {
    bookmarkLoading.value = false
  }
}

// --- Share ----------------------------------------------------------------

const shareMessage = ref('')
let shareMessageTimer: ReturnType<typeof setTimeout> | null = null

const sharePost = async () => {
  if (!post.value) return
  const url = window.location.href
  try {
    await navigator.clipboard.writeText(url)
    shareMessage.value = 'Link copied!'
  } catch {
    shareMessage.value = 'Could not copy link.'
  }
  blogApi.trackLinkClick(post.value.id, url)
  if (shareMessageTimer) clearTimeout(shareMessageTimer)
  shareMessageTimer = setTimeout(() => {
    shareMessage.value = ''
  }, 2000)
}

// --- Reporting (post + comments share one inline panel) -------------------

const reportTarget = ref<{ type: 'blog' | 'comment'; id: string } | null>(null)
const reportReason = ref('')
const reportSubmitting = ref(false)
const reportError = ref('')
const reportSuccessMessage = ref('')
let reportSuccessTimer: ReturnType<typeof setTimeout> | null = null

const showReportPostButton = computed(() =>
  !!post.value && auth.isAuthenticated && auth.user?.id !== post.value.authorId
)

const openReport = (type: 'blog' | 'comment', id: string) => {
  reportTarget.value = { type, id }
  reportReason.value = ''
  reportError.value = ''
}

const closeReport = () => {
  reportTarget.value = null
}

const submitReport = async () => {
  if (!reportTarget.value || !reportReason.value.trim()) return
  reportSubmitting.value = true
  reportError.value = ''
  try {
    if (reportTarget.value.type === 'blog') {
      await blogApi.reportBlog(reportTarget.value.id, { reason: reportReason.value.trim() })
    } else {
      await blogApi.reportComment(reportTarget.value.id, { reason: reportReason.value.trim() })
    }
    reportTarget.value = null
    reportSuccessMessage.value = 'Thanks — this has been reported.'
    if (reportSuccessTimer) clearTimeout(reportSuccessTimer)
    reportSuccessTimer = setTimeout(() => {
      reportSuccessMessage.value = ''
    }, 3000)
  } catch (err) {
    reportError.value = (err as ApiError)?.message ?? 'Failed to submit report.'
  } finally {
    reportSubmitting.value = false
  }
}

// --- Reading progress tracking ---------------------------------------------

let scrollScheduled = false
const lastTrackedMilestone = ref(0)

const computeReadProgress = (): number | undefined => {
  if (!articleEl.value) return undefined
  const rect = articleEl.value.getBoundingClientRect()
  const viewportHeight = window.innerHeight
  const scrolledPast = viewportHeight - rect.top
  const scrollable = rect.height - viewportHeight
  if (scrollable <= 0) {
    return scrolledPast > 0 ? 100 : 0
  }
  return Math.min(100, Math.max(0, Math.round((scrolledPast / scrollable) * 100)))
}

const handleScroll = () => {
  if (scrollScheduled || !post.value) return
  scrollScheduled = true
  window.requestAnimationFrame(() => {
    scrollScheduled = false
    const progress = computeReadProgress()
    if (progress === undefined || !post.value) return
    const milestone = Math.floor(progress / 25) * 25
    if (milestone > lastTrackedMilestone.value && milestone > 0) {
      lastTrackedMilestone.value = milestone
      blogApi.trackReadProgress(post.value.id, milestone)
    }
  })
}

// --- Comments ---------------------------------------------------------------

const comments = ref<Comment[]>([])
const commentsTotal = ref(0)
const commentsPage = ref(1)
const commentsTotalPages = ref(1)
const commentsLoading = ref(true)
const commentsLoadingMore = ref(false)
const commentsError = ref('')

const newCommentContent = ref('')
const submittingComment = ref(false)

const replyingToId = ref<string | null>(null)
const replyContent = ref('')
const submittingReply = ref(false)

const editingCommentId = ref<string | null>(null)
const editContent = ref('')
const savingEdit = ref(false)

const deletingCommentId = ref<string | null>(null)

const canEdit = (comment: Comment) => auth.user?.id === comment.userId
const canDelete = (comment: Comment) => auth.user?.id === comment.userId || auth.isAdmin
const canReport = (comment: Comment) => auth.isAuthenticated && auth.user?.id !== comment.userId

const loadComments = async (reset: boolean) => {
  if (!post.value) return
  if (reset) commentsLoading.value = true
  commentsError.value = ''
  try {
    const nextPage = reset ? 1 : commentsPage.value + 1
    const result = await blogApi.getComments(post.value.id, nextPage, 10)
    comments.value = reset ? result.comments : [...comments.value, ...result.comments]
    commentsTotal.value = result.total
    commentsPage.value = result.page
    commentsTotalPages.value = result.totalPages
  } catch (err) {
    commentsError.value = (err as ApiError)?.message ?? 'Failed to load comments.'
  } finally {
    commentsLoading.value = false
    commentsLoadingMore.value = false
  }
}

const loadMoreComments = () => {
  if (commentsLoadingMore.value || commentsPage.value >= commentsTotalPages.value) return
  commentsLoadingMore.value = true
  loadComments(false)
}

const submitComment = async () => {
  if (!post.value || !newCommentContent.value.trim()) return
  submittingComment.value = true
  commentsError.value = ''
  try {
    const comment = await blogApi.createComment(post.value.id, newCommentContent.value.trim())
    comments.value = [comment, ...comments.value]
    commentsTotal.value += 1
    newCommentContent.value = ''
  } catch (err) {
    commentsError.value = (err as ApiError)?.message ?? 'Failed to post comment.'
  } finally {
    submittingComment.value = false
  }
}

const startReply = (commentId: string) => {
  replyingToId.value = replyingToId.value === commentId ? null : commentId
  replyContent.value = ''
}

const submitReply = async (parentId: string) => {
  if (!post.value || !replyContent.value.trim()) return
  submittingReply.value = true
  commentsError.value = ''
  try {
    const reply = await blogApi.createComment(post.value.id, replyContent.value.trim(), parentId)
    const parent = comments.value.find((c) => c.id === parentId)
    if (parent) {
      parent.replies = [...(parent.replies ?? []), reply]
    }
    replyContent.value = ''
    replyingToId.value = null
  } catch (err) {
    commentsError.value = (err as ApiError)?.message ?? 'Failed to post reply.'
  } finally {
    submittingReply.value = false
  }
}

const startEdit = (comment: Comment) => {
  editingCommentId.value = comment.id
  editContent.value = comment.content
}

const cancelEdit = () => {
  editingCommentId.value = null
  editContent.value = ''
}

const saveEdit = async (comment: Comment) => {
  if (!editContent.value.trim()) return
  savingEdit.value = true
  commentsError.value = ''
  try {
    const updated = await blogApi.updateComment(comment.id, editContent.value.trim())
    comment.content = updated.content
    comment.updatedAt = updated.updatedAt
    editingCommentId.value = null
  } catch (err) {
    commentsError.value = (err as ApiError)?.message ?? 'Failed to update comment.'
  } finally {
    savingEdit.value = false
  }
}

const deleteCommentAction = async (comment: Comment, parentId?: string) => {
  if (!confirm('Delete this comment?')) return
  deletingCommentId.value = comment.id
  commentsError.value = ''
  try {
    await blogApi.deleteComment(comment.id)
    if (parentId) {
      const parent = comments.value.find((c) => c.id === parentId)
      if (parent?.replies) {
        parent.replies = parent.replies.filter((r) => r.id !== comment.id)
      }
    } else {
      comments.value = comments.value.filter((c) => c.id !== comment.id)
      commentsTotal.value = Math.max(0, commentsTotal.value - 1)
    }
  } catch (err) {
    commentsError.value = (err as ApiError)?.message ?? 'Failed to delete comment.'
  } finally {
    deletingCommentId.value = null
  }
}

// --- Post load --------------------------------------------------------------

const loadPost = async () => {
  loading.value = true
  notFound.value = false
  error.value = ''
  try {
    const result = await blogApi.getBySlug(slug)
    post.value = result
    likesCount.value = result.analytics?.likes ?? 0
    commentsTotal.value = result.analytics?.comments ?? 0

    try {
      relatedPosts.value = await blogApi.getSuggested(result.id)
    } catch {
      relatedPosts.value = []
    }

    if (auth.isAuthenticated && result.author?.username && auth.user?.id !== result.authorId) {
      try {
        const profile = await profileApi.getPublicProfile(result.author.username)
        isFollowing.value = profile.isFollowedByMe
      } catch {
        isFollowing.value = false
      }
    }

    loadComments(true)
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

onMounted(() => {
  loadPost()
  window.addEventListener('scroll', handleScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  if (shareMessageTimer) clearTimeout(shareMessageTimer)
  if (reportSuccessTimer) clearTimeout(reportSuccessTimer)
})
</script>
