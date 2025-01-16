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
                    <!-- Content using the typography plugin -->
                    <h2>Frequently Asked Questions</h2>
                    <div v-for="faq in faqs" :key="faq.id" class="mb-8">
                        <h3>{{ faq.question }}</h3>
                        <p>{{ faq.answer }}</p>
                    </div>
                </div>
            </div>
        </main>
    </div>
</template>