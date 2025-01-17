<template>
  <div class="min-h-screen bg-primary-50">
    <header class="bg-white shadow-sm">
      <div class="max-w-7xl mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold text-primary-900">Account Settings</h1>
        <p class="mt-2 text-lg text-primary-600">Manage your account and preferences</p>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-12">
      <div class="bg-white rounded-xl shadow-sm p-8">
        <div class="prose prose-primary max-w-none">
          <h2>Managing Your Account</h2>
          
          <h3>Profile Settings</h3>
          <p>Your profile represents you on ManKahi. Here's how to keep it up to date:</p>
          <ul>
            <li>
              <strong>Profile Picture:</strong> Upload a clear, professional photo that represents you
            </li>
            <li>
              <strong>Bio:</strong> Write a brief description about yourself and your interests
            </li>
            <li>
              <strong>Social Links:</strong> Connect your social media profiles
            </li>
          </ul>

          <div class="bg-primary-50 p-6 rounded-lg my-8">
            <h4 class="text-lg font-semibold text-primary-900 mb-2">Pro Tip</h4>
            <p class="text-primary-600">Keep your bio current and engaging to attract more readers to your stories.</p>
          </div>

          <h3>Account Security</h3>
          <p>Protect your account with these security features:</p>
          <ul>
            <li>Two-factor authentication</li>
            <li>Strong password requirements</li>
            <li>Login history monitoring</li>
            <li>Connected devices management</li>
          </ul>

          <h3>Email Preferences</h3>
          <p>Control what emails you receive:</p>
          <ul>
            <li>New follower notifications</li>
            <li>Comment notifications</li>
            <li>Story recommendations</li>
            <li>Newsletter subscriptions</li>
          </ul>

          <h3>Privacy Controls</h3>
          <p>Manage your privacy settings:</p>
          <ul>
            <li>Profile visibility</li>
            <li>Story visibility</li>
            <li>Comment permissions</li>
            <li>Data sharing preferences</li>
          </ul>

          <div class="mt-8 space-y-4">
            <div class="flex items-center justify-between p-4 border border-primary-200 rounded-lg">
              <div>
                <h4 class="font-medium text-primary-900">Update Profile</h4>
                <p class="text-sm text-primary-600">Edit your profile information</p>
              </div>
              <NuxtLink to="/user/settings"
                class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                Edit Profile
              </NuxtLink>
            </div>

            <div class="flex items-center justify-between p-4 border border-primary-200 rounded-lg">
              <div>
                <h4 class="font-medium text-primary-900">Security Settings</h4>
                <p class="text-sm text-primary-600">Manage your account security</p>
              </div>
              <NuxtLink to="/user/settings"
                class="px-4 py-2 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50">
                Security Settings
              </NuxtLink>
            </div>
          </div>

          <div class="mt-12 p-6 bg-primary-50 rounded-lg">
            <h3 class="text-lg font-semibold text-primary-900 mb-2">Need assistance?</h3>
            <p class="text-primary-600 mb-4">Our support team is here to help with any account-related questions.</p>
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