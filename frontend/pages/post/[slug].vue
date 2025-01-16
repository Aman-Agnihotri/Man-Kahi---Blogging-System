<template>
  <div class="min-h-screen bg-primary-50">
    <article class="max-w-4xl mx-auto px-4 py-12">
      <header class="mb-8">
        <div class="flex items-center space-x-2 mb-4">
          <span
            v-for="tag in post.tags"
            :key="tag"
            class="px-2 py-1 bg-primary-100 text-primary-700 text-sm rounded-full"
          >
            {{ tag }}
          </span>
        </div>
        
        <h1 class="text-4xl font-bold text-primary-900 mb-4">
          {{ post.title }}
        </h1>
        
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-4">
            <NuxtLink :to="`/@${post.author.username}`" class="flex items-center space-x-3">
              <img
                :src="post.author.avatar"
                :alt="post.author.name"
                class="w-12 h-12 rounded-full"
              >
              <div>
                <p class="font-medium text-primary-900">{{ post.author.name }}</p>
                <p class="text-sm text-primary-600">{{ formatDate(post.publishedAt) }}</p>
              </div>
            </NuxtLink>
            
            <button class="px-4 py-2 border-2 border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50">
              Follow
            </button>
          </div>
          
          <div class="flex items-center space-x-4 text-primary-600">
            <button class="flex items-center space-x-2">
              <i class="ri-bookmark-line text-xl"></i>
              <span>Save</span>
            </button>
            <button class="flex items-center space-x-2">
              <i class="ri-share-line text-xl"></i>
              <span>Share</span>
            </button>
          </div>
        </div>
      </header>
      
      <img
        :src="post.coverImage"
        :alt="post.title"
        class="w-full h-96 object-cover rounded-xl mb-8"
      >
      
      <div class="prose prose-lg max-w-none">
        <div v-html="post.content"></div>
      </div>
      
      <footer class="mt-12 pt-8 border-t border-primary-200">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-4">
            <button class="flex items-center space-x-2 text-primary-600">
              <i class="ri-heart-line text-xl"></i>
              <span>{{ post.stats.likes }}</span>
            </button>
            <button class="flex items-center space-x-2 text-primary-600">
              <i class="ri-chat-1-line text-xl"></i>
              <span>{{ post.stats.comments }}</span>
            </button>
          </div>
          
          <div class="flex items-center space-x-4 text-sm text-primary-500">
            <span class="flex items-center">
              <i class="ri-eye-line mr-1"></i>
              {{ post.stats.views }} views
            </span>
            <span class="flex items-center">
              <i class="ri-time-line mr-1"></i>
              {{ post.stats.readTime }} min read
            </span>
          </div>
        </div>
      </footer>
    </article>
    
    <div class="max-w-4xl mx-auto px-4 py-12">
      <h2 class="text-2xl font-bold text-primary-900 mb-8">More from {{ post.author.name }}</h2>
      <div class="grid md:grid-cols-2 gap-8">
        <article
          v-for="relatedPost in relatedPosts"
          :key="relatedPost.id"
          class="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
        >
          <img
            :src="relatedPost.coverImage"
            :alt="relatedPost.title"
            class="w-full h-48 object-cover"
          >
          <div class="p-6">
            <NuxtLink :to="`/post/${relatedPost.slug}`">
              <h3 class="text-xl font-semibold text-primary-900 mb-2 hover:text-primary-600">
                {{ relatedPost.title }}
              </h3>
            </NuxtLink>
            <p class="text-primary-600 mb-4 line-clamp-2">
              {{ relatedPost.excerpt }}
            </p>
          </div>
        </article>
      </div>
    </div>
   </div>
</template>

<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug as string

// Dummy post data
const post = ref({
  title: 'The Art of Mindful Programming',
  slug: 'art-of-mindful-programming',
  content: `
    <p>In the fast-paced world of software development, it's easy to get caught up in the rush to ship features and meet deadlines. However, taking a mindful approach to programming can not only improve the quality of your code but also make you a more effective developer.</p>
    
    <h2>What is Mindful Programming?</h2>
    <p>Mindful programming is the practice of bringing full attention and awareness to the act of writing code. It involves being present in the moment, carefully considering each decision, and maintaining a clear understanding of how your code fits into the larger system.</p>
    
    <h2>Key Principles</h2>
    <ul>
      <li>Focus on one task at a time</li>
      <li>Take regular breaks to maintain clarity</li>
      <li>Review your code with intention</li>
      <li>Practice empathy for future maintainers</li>
    </ul>
    
    <h2>Benefits of Mindful Programming</h2>
    <p>When we approach programming mindfully, we experience numerous benefits:</p>
    <ul>
      <li>Fewer bugs and better code quality</li>
      <li>Improved problem-solving abilities</li>
      <li>Reduced stress and mental fatigue</li>
      <li>More enjoyable coding experience</li>
    </ul>
  `,
  coverImage: 'https://images.unsplash.com/photo-1516259762381-22954d7d3ad2?auto=format&fit=crop&q=80',
  tags: ['Technology', 'Programming'],
  author: {
    name: 'Sarah Chen',
    username: 'sarahchen',
    avatar: 'https://i.pravatar.cc/150?img=1'
  },
  publishedAt: '2024-04-01T12:00:00Z',
  stats: {
    views: '2.5k',
    likes: '342',
    comments: '28',
    readTime: 8
  }
})

// Dummy related posts
const relatedPosts = ref([
  {
    id: 2,
    title: 'Building Sustainable Design Systems',
    slug: 'sustainable-design-systems',
    excerpt: 'Learn how to create and maintain scalable design systems that grow with your product.',
    coverImage: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&q=80'
  },
  {
    id: 3,
    title: 'The Future of Web Development',
    slug: 'future-of-web-development',
    excerpt: 'Exploring upcoming trends and technologies that will shape the future of web development.',
    coverImage: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80'
  }
])

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}
</script>