<template>
  <div class="min-h-screen bg-primary-50">
    <header class="bg-white shadow-sm">
      <div class="max-w-7xl mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold text-primary-900">Writing Guide</h1>
        <p class="mt-2 text-lg text-primary-600">Tips and best practices for creating great content</p>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-12">
      <div class="bg-white rounded-xl shadow-sm p-8">
        <div class="prose prose-primary max-w-none">
          <h2>Getting Started with Writing</h2>
          <p>Welcome to the ManKahi writing guide! This comprehensive resource will help you create engaging content that resonates with your readers.</p>

          <h3>Writing Tips</h3>
          <ul>
            <li>
              <strong>Know your audience</strong>
              <p>Understanding who you're writing for helps you create more relevant and engaging content.</p>
            </li>
            <li>
              <strong>Create compelling headlines</strong>
              <p>Your headline is the first thing readers see. Make it clear, interesting, and accurate.</p>
            </li>
            <li>
              <strong>Use clear, concise language</strong>
              <p>Write in a way that's easy to understand. Avoid jargon unless necessary for your topic.</p>
            </li>
            <li>
              <strong>Include relevant images</strong>
              <p>Visual content helps break up text and illustrates your points more effectively.</p>
            </li>
          </ul>

          <h3>Formatting Your Content</h3>
          <p>Well-formatted content is easier to read and more engaging. Here are some tips:</p>
          <ul>
            <li>Use headers to organize your content</li>
            <li>Keep paragraphs short (3-4 sentences)</li>
            <li>Use bullet points for lists</li>
            <li>Include relevant quotes and citations</li>
            <li>Add code blocks for technical content</li>
          </ul>

          <h3>SEO Best Practices</h3>
          <p>Help readers find your content with these SEO tips:</p>
          <ul>
            <li>Use descriptive titles</li>
            <li>Include relevant keywords naturally</li>
            <li>Write meta descriptions</li>
            <li>Use alt text for images</li>
          </ul>

          <div class="bg-primary-50 p-6 rounded-lg my-8">
            <h4 class="text-lg font-semibold text-primary-900 mb-2">Pro Tip</h4>
            <p class="text-primary-600">Before publishing, always preview your content to ensure it looks good on both desktop and mobile devices.</p>
          </div>

          <h3>Community Guidelines</h3>
          <p>To maintain a high-quality platform, please follow these guidelines:</p>
          <ul>
            <li>Original content only - no plagiarism</li>
            <li>Respectful and constructive discourse</li>
            <li>Accurate information and fact-checking</li>
            <li>Proper attribution for quotes and resources</li>
          </ul>

          <div class="mt-8 p-6 border border-primary-200 rounded-lg">
            <h4 class="text-lg font-semibold text-primary-900 mb-4">Ready to start writing?</h4>
            <NuxtLink to="/content/write"
              class="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
              Create New Story
            </NuxtLink>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>