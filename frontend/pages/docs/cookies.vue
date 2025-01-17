<template>
  <div class="min-h-screen bg-primary-50">
    <header class="bg-white shadow-sm">
      <div class="max-w-7xl mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold text-primary-900">Cookie Policy</h1>
        <p class="mt-2 text-lg text-primary-600">How we use cookies</p>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-12">
      <div class="bg-white rounded-xl shadow-sm p-8">
        <div class="prose prose-primary max-w-none">
          <p class="text-sm text-primary-500">Last updated: April 1, 2024</p>

          <h2>What Are Cookies</h2>
          <p>Cookies are small text files that are stored on your device when you visit our website. They help us provide you with a better experience by remembering your preferences and understanding how you use our platform.</p>

          <h2>Types of Cookies We Use</h2>
          
          <h3>Essential Cookies</h3>
          <p>These cookies are necessary for the website to function properly. They enable basic functions like page navigation and access to secure areas of the website.</p>
          <ul>
            <li>Authentication cookies</li>
            <li>Security cookies</li>
            <li>Session management</li>
          </ul>

          <h3>Preference Cookies</h3>
          <p>These cookies remember your choices and customize your experience.</p>
          <ul>
            <li>Language preferences</li>
            <li>Theme settings</li>
            <li>Reading preferences</li>
          </ul>

          <h3>Analytics Cookies</h3>
          <p>We use these cookies to understand how visitors interact with our website.</p>
          <ul>
            <li>Page view statistics</li>
            <li>Traffic sources</li>
            <li>User behavior patterns</li>
          </ul>

          <h2>Managing Cookies</h2>
          <p>You can control and/or delete cookies as you wish. You can delete all cookies that are already on your computer and you can set most browsers to prevent them from being placed.</p>

          <div class="bg-primary-50 p-6 rounded-lg my-8">
            <h4 class="text-lg font-semibold text-primary-900 mb-2">Cookie Preferences</h4>
            <p class="text-primary-600 mb-4">You can adjust your cookie preferences at any time.</p>
            <button class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
              Manage Cookie Settings
            </button>
          </div>

          <h2>Third-Party Cookies</h2>
          <p>Some of our pages may contain content from other sites, like embedded videos or social media links. These sites may set their own cookies. We don't control these cookies and recommend checking the privacy policies of these sites.</p>

          <h2>Updates to This Policy</h2>
          <p>We may update this Cookie Policy from time to time. Any changes will be posted on this page with an updated revision date.</p>

          <div class="mt-8 p-6 border border-primary-200 rounded-lg">
            <h3 class="text-lg font-semibold text-primary-900 mb-2">Questions about cookies?</h3>
            <p class="text-primary-600 mb-4">Contact us if you have any questions about how we use cookies.</p>
            <NuxtLink to="/contact"
              class="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
              Contact Us
            </NuxtLink>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>