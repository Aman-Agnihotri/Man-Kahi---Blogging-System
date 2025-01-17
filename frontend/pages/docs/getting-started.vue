<template>
  <div class="min-h-screen bg-primary-50">
    <header class="bg-white shadow-sm">
      <div class="max-w-7xl mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold text-primary-900">Getting Started</h1>
        <p class="mt-2 text-lg text-primary-600">Learn the basics of using ManKahi</p>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-12">
      <div class="bg-white rounded-xl shadow-sm p-8">
        <div class="prose prose-primary max-w-none">
          <h2>Welcome to ManKahi</h2>
          <p>ManKahi is a platform where ideas come to life. Whether you're a seasoned writer or just starting out, this guide will help you make the most of our platform.</p>

          <h2>Quick Start Guide</h2>
          <div class="space-y-6">
            <div class="flex gap-4">
              <div class="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 font-semibold">
                1
              </div>
              <div>
                <h3 class="text-lg font-semibold text-primary-900">Create Your Account</h3>
                <p class="text-primary-600">Sign up using your email address or social media accounts.</p>
                <NuxtLink to="/auth/register" class="text-primary-600 hover:text-primary-800 font-medium">
                  Create account →
                </NuxtLink>
              </div>
            </div>

            <div class="flex gap-4">
              <div class="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 font-semibold">
                2
              </div>
              <div>
                <h3 class="text-lg font-semibold text-primary-900">Complete Your Profile</h3>
                <p class="text-primary-600">Add a profile picture, bio, and other details to help readers know you better.</p>
              </div>
            </div>

            <div class="flex gap-4">
              <div class="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 font-semibold">
                3
              </div>
              <div>
                <h3 class="text-lg font-semibold text-primary-900">Start Writing</h3>
                <p class="text-primary-600">Click the "Write" button to create your first story.</p>
                <NuxtLink to="/content/write" class="text-primary-600 hover:text-primary-800 font-medium">
                  Start writing →
                </NuxtLink>
              </div>
            </div>
          </div>

          <h2 class="mt-12">Key Features</h2>
          <div class="grid md:grid-cols-2 gap-6">
            <div class="p-6 bg-primary-50 rounded-lg">
              <i class="ri-edit-line text-2xl text-primary-600 mb-2"></i>
              <h3 class="text-lg font-semibold text-primary-900 mb-2">Rich Text Editor</h3>
              <p class="text-primary-600">Write and format your stories with our intuitive editor.</p>
            </div>

            <div class="p-6 bg-primary-50 rounded-lg">
              <i class="ri-group-line text-2xl text-primary-600 mb-2"></i>
              <h3 class="text-lg font-semibold text-primary-900 mb-2">Community Engagement</h3>
              <p class="text-primary-600">Connect with readers through comments and discussions.</p>
            </div>

            <div class="p-6 bg-primary-50 rounded-lg">
              <i class="ri-line-chart-line text-2xl text-primary-600 mb-2"></i>
              <h3 class="text-lg font-semibold text-primary-900 mb-2">Analytics</h3>
              <p class="text-primary-600">Track your stories' performance and reader engagement.</p>
            </div>

            <div class="p-6 bg-primary-50 rounded-lg">
              <i class="ri-share-line text-2xl text-primary-600 mb-2"></i>
              <h3 class="text-lg font-semibold text-primary-900 mb-2">Social Sharing</h3>
              <p class="text-primary-600">Share your stories across social media platforms.</p>
            </div>
          </div>

          <div class="mt-12 p-6 border border-primary-200 rounded-lg">
            <h3 class="text-lg font-semibold text-primary-900 mb-2">Need Help?</h3>
            <p class="text-primary-600 mb-4">Check out our detailed guides or contact support.</p>
            <div class="flex space-x-4">
              <NuxtLink to="/docs/guide"
                class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                Writing Guide
              </NuxtLink>
              <NuxtLink to="/contact"
                class="px-4 py-2 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50">
                Contact Support
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>