<template>
  <div class="min-h-screen bg-primary-50">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="mb-8 flex justify-between items-center">
        <h1 class="text-3xl font-bold text-primary-900">Dashboard</h1>
        <NuxtLink to="/content/write" class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          Write New Story
        </NuxtLink>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <!-- Stats -->
        <div class="col-span-2 grid grid-cols-3 gap-4">
          <div class="bg-white p-6 rounded-xl shadow-sm">
            <h3 class="text-lg font-semibold text-primary-900 mb-2">Total Views</h3>
            <p class="text-3xl font-bold text-primary-600">12.5K</p>
            <p class="text-sm text-primary-500">+15% from last month</p>
          </div>

          <div class="bg-white p-6 rounded-xl shadow-sm">
            <h3 class="text-lg font-semibold text-primary-900 mb-2">Stories</h3>
            <p class="text-3xl font-bold text-primary-600">24</p>
            <p class="text-sm text-primary-500">3 drafts</p>
          </div>

          <div class="bg-white p-6 rounded-xl shadow-sm">
            <h3 class="text-lg font-semibold text-primary-900 mb-2">Readers</h3>
            <p class="text-3xl font-bold text-primary-600">8.2K</p>
            <p class="text-sm text-primary-500">+25% from last month</p>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="bg-white p-6 rounded-xl shadow-sm">
          <h3 class="text-lg font-semibold text-primary-900 mb-4">Quick Actions</h3>
          <div class="space-y-4">
            <button class="w-full text-left px-4 py-2 rounded-lg hover:bg-primary-50 flex items-center">
              <i class="ri-edit-line mr-2 text-primary-600"></i>
              Continue Draft
            </button>
            <button class="w-full text-left px-4 py-2 rounded-lg hover:bg-primary-50 flex items-center">
              <i class="ri-settings-line mr-2 text-primary-600"></i>
              Edit Profile
            </button>
            <button class="w-full text-left px-4 py-2 rounded-lg hover:bg-primary-50 flex items-center">
              <i class="ri-line-chart-line mr-2 text-primary-600"></i>
              View Analytics
            </button>
          </div>
        </div>
      </div>

      <!-- Recent Stories -->
      <div class="mt-8">
        <h2 class="text-2xl font-bold text-primary-900 mb-6">Recent Stories</h2>
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
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
                  {{ story.publishedAt }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button class="text-primary-600 hover:text-primary-900">Edit</button>
                  <button class="ml-4 text-red-600 hover:text-red-900">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const recentStories = ref([
    {
      id: 1,
      title: 'The Art of Mindful Programming',
      status: 'published',
      views: '2.5k',
      publishedAt: 'Apr 1, 2024'
    },
    {
      id: 2,
      title: 'Building Sustainable Design Systems',
      status: 'published',
      views: '1.8k',
      publishedAt: 'Mar 28, 2024'
    },
    {
      id: 3,
      title: 'The Future of Web Development',
      status: 'draft',
      views: '-',
      publishedAt: '-'
    }
  ])
</script>