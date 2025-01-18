<template>
  <div class="min-h-screen bg-primary-50">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="mb-8 flex justify-between items-center">
        <h1 class="text-3xl font-bold text-primary-900">My Stories</h1>
        <NuxtLink to="/content/write" class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          Write New Story
        </NuxtLink>
      </div>

      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <div class="p-4 border-b border-primary-200">
          <div class="flex items-center space-x-4">
            <div class="flex-1">
              <input type="text" placeholder="Search stories..."
                class="w-full px-4 py-2 rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500">
            </div>
            <select v-model="selectedStatus"
              class="rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500">
              <option value="">All Status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
            <select v-model="selectedCategory"
              class="rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500">
              <option value="">All Categories</option>
              <option v-for="category in categories" :key="category.id" :value="category.id">
                {{ category.name }}
              </option>
            </select>
          </div>
        </div>

        <table class="min-w-full divide-y divide-primary-200">
          <thead class="bg-primary-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Title
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Category
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
            <tr v-for="story in stories" :key="story.id">
              <td class="px-6 py-4">
                <div class="flex items-center">
                  <img :src="story.coverImage" :alt="story.title" class="h-10 w-16 object-cover rounded">
                  <div class="ml-4">
                    <div class="text-sm font-medium text-primary-900">{{ story.title }}</div>
                    <div class="text-sm text-primary-500">{{ story.excerpt.substring(0, 50) }}...</div>
                  </div>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-sm text-primary-600">{{ story.category }}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="{
                  'px-2 py-1 text-xs font-medium rounded-full': true,
                  'bg-green-100 text-green-800': story.status === 'published',
                  'bg-yellow-100 text-yellow-800': story.status === 'draft'
                }">
                  {{ story.status }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-primary-500">
                {{ story.views }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-primary-500">
                {{ story.publishedAt || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <NuxtLink :to="`/content/write?edit=${story.id}`" class="text-primary-600 hover:text-primary-900">
                  Edit
                </NuxtLink>
                <button @click="deleteStory(story.id)" class="ml-4 text-red-600 hover:text-red-900">
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="px-6 py-4 border-t border-primary-200">
          <div class="flex items-center justify-between">
            <p class="text-sm text-primary-500">
              Showing 1-10 of 24 stories
            </p>
            <div class="flex space-x-2">
              <button class="px-3 py-1 border border-primary-200 rounded hover:bg-primary-50">
                Previous
              </button>
              <button class="px-3 py-1 border border-primary-200 rounded hover:bg-primary-50">
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
const selectedStatus = ref('')
const selectedCategory = ref('')

const categories = [
  { id: 1, name: 'Article' },
  { id: 2, name: 'Project' },
  { id: 3, name: 'Guide' },
  { id: 4, name: 'Interactive' }
]

const stories = ref([
  {
    id: 1,
    title: 'The Art of Mindful Programming',
    excerpt: 'Discover how mindfulness can improve your coding practice and make you a better developer.',
    coverImage: 'https://images.unsplash.com/photo-1516259762381-22954d7d3ad2?auto=format&fit=crop&q=80',
    category: 'Article',
    status: 'published',
    views: '2.5k',
    publishedAt: 'Apr 1, 2024'
  },
  {
    id: 2,
    title: 'Building Sustainable Design Systems',
    excerpt: 'Learn how to create and maintain scalable design systems that grow with your product.',
    coverImage: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&q=80',
    category: 'Project',
    status: 'published',
    views: '1.8k',
    publishedAt: 'Mar 28, 2024'
  },
  {
    id: 3,
    title: 'Future of Web Development',
    excerpt: 'A look into the upcoming trends and technologies in web development.',
    coverImage: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80',
    category: 'Article',
    status: 'draft',
    views: '-',
    publishedAt: null
  }
])

const deleteStory = (id: number) => {
  if (confirm('Are you sure you want to delete this story?')) {
    stories.value = stories.value.filter(story => story.id !== id)
  }
}
</script>