<template>
  <div class="min-h-screen bg-primary-50">
    <div class="max-w-4xl mx-auto px-4 py-12">
      <h1 class="text-3xl font-bold text-primary-900 mb-8">Settings</h1>
      
      <div class="bg-white rounded-xl shadow-sm p-8">
        <div class="flex items-center space-x-8 mb-8">
          <img
            :src="profile.avatar"
            :alt="profile.name"
            class="w-24 h-24 rounded-full border-4 border-primary-200"
          >
          <div>
            <button class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
              Change Photo
            </button>
          </div>
        </div>
        
        <form @submit.prevent="saveSettings" class="space-y-6">
          <div>
            <label class="block text-sm font-medium text-primary-700 mb-2">
              Display Name
            </label>
            <input
              v-model="profile.name"
              type="text"
              class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
            >
          </div>
          
          <div>
            <label class="block text-sm font-medium text-primary-700 mb-2">
              Username
            </label>
            <input
              v-model="profile.username"
              type="text"
              class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
            >
          </div>
          
          <div>
            <label class="block text-sm font-medium text-primary-700 mb-2">
              Email
            </label>
            <input
              v-model="profile.email"
              type="email"
              class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
            >
          </div>
          
          <div>
            <label class="block text-sm font-medium text-primary-700 mb-2">
              Bio
            </label>
            <textarea
              v-model="profile.bio"
              rows="4"
              class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
            ></textarea>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-primary-700 mb-2">
              Website
            </label>
            <input
              v-model="profile.website"
              type="url"
              class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
            >
          </div>
          
          <div class="pt-6 border-t border-primary-200">
            <button
              type="submit"
              class="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
      
      <div class="mt-8 bg-white rounded-xl shadow-sm p-8">
        <h2 class="text-xl font-bold text-primary-900 mb-6">Preferences</h2>
        
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-medium text-primary-900">Email Notifications</h3>
              <p class="text-sm text-primary-600">Receive notifications about new followers and comments</p>
            </div>
            <button
              class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              :class="emailNotifications ? 'bg-primary-600' : 'bg-primary-200'"
              @click="emailNotifications = !emailNotifications"
            >
              <span
                class="inline-block h-5 w-5 transform rounded-full bg-white transition duration-200 ease-in-out"
                :class="emailNotifications ? 'translate-x-5' : 'translate-x-0'"
              ></span>
            </button>
          </div>
          
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-medium text-primary-900">Newsletter</h3>
              <p class="text-sm text-primary-600">Receive our weekly newsletter with top stories</p>
            </div>
            <button
              class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              :class="newsletter ? 'bg-primary-600' : 'bg-primary-200'"
              @click="newsletter = !newsletter"
            >
              <span
                class="inline-block h-5 w-5 transform rounded-full bg-white transition duration-200 ease-in-out"
                :class="newsletter ? 'translate-x-5' : 'translate-x-0'"
              ></span>
            </button>
          </div>
        </div>
      </div>
      
      <div class="mt-8 bg-white rounded-xl shadow-sm p-8">
        <h2 class="text-xl font-bold text-red-600 mb-6">Danger Zone</h2>
        <button
          @click="deleteAccount"
          class="px-6 py-2 border-2 border-red-600 text-red-600 rounded-lg hover:bg-red-50"
        >
          Delete Account
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const router = useRouter()

// Dummy profile data
const profile = ref({
  name: 'Sarah Chen',
  username: 'sarahchen',
  email: 'sarah@example.com',
  bio: 'Software engineer by day, writer by night. Passionate about technology, design, and storytelling.',
  website: 'https://sarahchen.dev',
  avatar: 'https://i.pravatar.cc/150?img=1'
})

const emailNotifications = ref(true)
const newsletter = ref(true)

const saveSettings = () => {
  // Simulate saving settings
  console.log('Saving settings...')
}

const deleteAccount = () => {
  // Simulate account deletion
  if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
    router.push('/')
  }
}
</script>