<template>
  <div class="min-h-screen bg-primary-50">
    <header class="bg-white shadow-sm">
      <div class="max-w-7xl mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold text-primary-900">Community Guidelines</h1>
        <p class="mt-2 text-lg text-primary-600">Our community rules and standards</p>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-12">
      <div class="bg-white rounded-xl shadow-sm p-8">
        <div class="prose prose-primary max-w-none">
          <h2>Our Community Values</h2>
          <p>ManKahi is built on the foundation of respect, creativity, and knowledge sharing. We strive to create a space where writers and readers can connect meaningfully.</p>

          <div class="grid md:grid-cols-2 gap-6 my-8">
            <div class="p-6 bg-primary-50 rounded-lg">
              <i class="ri-user-heart-line text-2xl text-primary-600 mb-2"></i>
              <h3 class="text-lg font-semibold text-primary-900 mb-2">Respect</h3>
              <p class="text-primary-600">Treat all community members with kindness and respect.</p>
            </div>

            <div class="p-6 bg-primary-50 rounded-lg">
              <i class="ri-shield-check-line text-2xl text-primary-600 mb-2"></i>
              <h3 class="text-lg font-semibold text-primary-900 mb-2">Safety</h3>
              <p class="text-primary-600">Create a safe environment for sharing ideas and stories.</p>
            </div>
          </div>

          <h2>Content Guidelines</h2>
          <h3>Do's</h3>
          <ul>
            <li>Share original, authentic content</li>
            <li>Provide constructive feedback</li>
            <li>Credit sources and references</li>
            <li>Use appropriate content warnings</li>
          </ul>

          <h3>Don'ts</h3>
          <ul>
            <li>Post harmful or hateful content</li>
            <li>Plagiarize or infringe on copyrights</li>
            <li>Spam or post misleading content</li>
            <li>Harass other community members</li>
          </ul>

          <h2>Engagement Guidelines</h2>
          <div class="space-y-4">
            <div class="p-4 border border-primary-200 rounded-lg">
              <h3 class="text-lg font-semibold text-primary-900 mb-2">Comments</h3>
              <ul>
                <li>Keep discussions respectful and on-topic</li>
                <li>Avoid personal attacks or trolling</li>
                <li>Report inappropriate comments</li>
              </ul>
            </div>

            <div class="p-4 border border-primary-200 rounded-lg">
              <h3 class="text-lg font-semibold text-primary-900 mb-2">Collaboration</h3>
              <ul>
                <li>Welcome diverse perspectives</li>
                <li>Share knowledge and experiences</li>
                <li>Support fellow community members</li>
              </ul>
            </div>
          </div>

          <h2>Reporting Violations</h2>
          <p>Help us maintain a healthy community:</p>
          <ul>
            <li>Use the report button for inappropriate content</li>
            <li>Provide context when reporting violations</li>
            <li>Contact moderators for serious issues</li>
          </ul>

          <div class="mt-12 p-6 border border-primary-200 rounded-lg">
            <h3 class="text-lg font-semibold text-primary-900 mb-2">Join Our Community</h3>
            <p class="text-primary-600 mb-4">Ready to be part of our growing community?</p>
            <div class="flex space-x-4">
              <NuxtLink to="/auth/register"
                class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                Join Now
              </NuxtLink>
              <NuxtLink to="/contact"
                class="px-4 py-2 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50">
                Contact Us
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>