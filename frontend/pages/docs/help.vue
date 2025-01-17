<template>
  <div class="min-h-screen bg-primary-50">
    <header class="bg-white shadow-sm">
      <div class="max-w-7xl mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold text-primary-900">Help Center</h1>
        <p class="mt-2 text-lg text-primary-600">Find answers to common questions</p>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-12">
      <div class="bg-white rounded-xl shadow-sm p-8">
        <div class="prose prose-primary max-w-none">
          <div class="mb-8">
            <div class="relative">
              <input type="text" placeholder="Search help articles..."
                class="w-full px-4 py-3 pl-12 rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500">
              <i class="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-primary-400"></i>
            </div>
          </div>

          <div class="grid md:grid-cols-2 gap-6 mb-12">
            <div v-for="category in helpCategories" :key="category.id"
              class="p-6 rounded-lg border border-primary-200 hover:border-primary-400 transition-colors">
              <i :class="category.icon" class="text-2xl text-primary-600 mb-2"></i>
              <h3 class="text-lg font-semibold text-primary-900 mb-2">{{ category.name }}</h3>
              <p class="text-primary-600 text-sm mb-4">{{ category.description }}</p>
              <NuxtLink :to="category.link" class="text-primary-600 hover:text-primary-800 text-sm font-medium">
                Learn more →
              </NuxtLink>
            </div>
          </div>

          <h2>Frequently Asked Questions</h2>
          <div v-for="faq in faqs" :key="faq.id" class="mb-6">
            <h3 class="text-lg font-medium text-primary-900 mb-2">{{ faq.question }}</h3>
            <p class="text-primary-600">{{ faq.answer }}</p>
          </div>

          <div class="mt-12 p-6 bg-primary-50 rounded-lg">
            <h3 class="text-lg font-semibold text-primary-900 mb-2">Still need help?</h3>
            <p class="text-primary-600 mb-4">Our support team is here to assist you.</p>
            <NuxtLink to="/contact"
              class="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
              Contact Support
            </NuxtLink>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
const helpCategories = [
  {
    id: 1,
    name: 'Getting Started',
    description: 'Learn the basics of using ManKahi',
    icon: 'ri-rocket-line',
    link: '/docs/getting-started'
  },
  {
    id: 2,
    name: 'Writing & Publishing',
    description: 'Tips for creating and publishing content',
    icon: 'ri-quill-pen-line',
    link: '/docs/guide'
  },
  {
    id: 3,
    name: 'Account Settings',
    description: 'Manage your account and preferences',
    icon: 'ri-user-settings-line',
    link: '/docs/account'
  },
  {
    id: 4,
    name: 'Community Guidelines',
    description: 'Our community rules and standards',
    icon: 'ri-group-line',
    link: '/docs/community'
  }
]

const faqs = ref([
  {
    id: 1,
    question: 'How do I start writing on ManKahi?',
    answer: 'Click the "Write" button in the top navigation bar. You\'ll need to create an account if you haven\'t already.'
  },
  {
    id: 2,
    question: 'Can I import stories from other platforms?',
    answer: 'Yes, you can import stories from Medium, WordPress, and other platforms. Go to Settings > Import to get started.'
  },
  {
    id: 3,
    question: 'How do I change my profile picture?',
    answer: 'Visit your Settings page and click on "Change Photo" under your current profile picture.'
  },
  {
    id: 4,
    question: 'What types of content can I publish?',
    answer: 'You can publish articles, tutorials, guides, and interactive stories. All content must follow our community guidelines.'
  }
])
</script>