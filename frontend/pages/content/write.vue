<template>
  <div class="min-h-screen bg-white">
    <div class="max-w-4xl mx-auto px-4 py-8">
      <div class="mb-8">
        <input
          v-model="title"
          type="text"
          placeholder="Title"
          class="w-full text-4xl font-bold focus:outline-none"
        />
      </div>
      
      <div class="mb-6 flex space-x-4">
        <select
          v-model="category"
          class="rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
        >
          <option value="">Select Category</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">
            {{ cat.name }}
          </option>
        </select>
        
        <div class="flex-1 flex space-x-2">
          <input
            v-model="newTag"
            type="text"
            placeholder="Add a tag"
            class="flex-1 rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
            @keyup.enter="addTag"
          />
          <button
            @click="addTag"
            class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Add
          </button>
        </div>
      </div>
      
      <div class="mb-6 flex flex-wrap gap-2">
        <span
          v-for="tag in tags"
          :key="tag"
          class="px-3 py-1 bg-primary-100 text-primary-700 rounded-full flex items-center"
        >
          {{ tag }}
          <button
            @click="removeTag(tag)"
            class="ml-2 text-primary-500 hover:text-primary-700"
          >
            ×
          </button>
        </span>
      </div>
      
      <div class="mb-8">
        <textarea
          v-model="content"
          placeholder="Write your story..."
          class="w-full h-96 p-4 rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
        ></textarea>
      </div>
      
      <div class="flex justify-between items-center">
        <button
          @click="saveDraft"
          class="px-6 py-2 border-2 border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50"
        >
          Save Draft
        </button>
        
        <button
          @click="publishStory"
          class="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Publish
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const router = useRouter()
const title = ref('')
const content = ref('')
const category = ref('')
const newTag = ref('')
const tags = ref<string[]>([])

const categories = ref([
  { id: 1, name: 'Article' },
  { id: 2, name: 'Project' },
  { id: 3, name: 'Guide' },
  { id: 4, name: 'Interactive' }
])

const addTag = () => {
  if (newTag.value && !tags.value.includes(newTag.value)) {
    tags.value.push(newTag.value)
    newTag.value = ''
  }
}

const removeTag = (tag: string) => {
  tags.value = tags.value.filter(t => t !== tag)
}

const saveDraft = () => {
  // Simulate saving draft
  console.log('Saving draft...')
}

const publishStory = () => {
  // Simulate publishing
  router.push('/dashboard')
}
</script>