<template>
    <div class="min-h-screen bg-primary-50">
        <header class="bg-white shadow-sm">
            <div class="max-w-7xl mx-auto px-4 py-8">
                <h1 class="text-3xl font-bold text-primary-900">Categories</h1>
                <p class="mt-2 text-lg text-primary-600">Browse stories by topic</p>
            </div>
        </header>

        <main class="max-w-7xl mx-auto px-4 py-12">
            <div class="grid md:grid-cols-3 gap-8">
                <div v-for="category in categories" :key="category.id"
                    class="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                    <h3 class="text-xl font-semibold text-primary-900 mb-2">{{ category.name }}</h3>
                    <p class="text-primary-600 mb-4">{{ category.description }}</p>
                    <NuxtLink :to="`/categories/${category.slug}`"
                        class="text-primary-600 hover:text-primary-800 font-medium">
                        Browse stories →
                    </NuxtLink>
                </div>
            </div>
        </main>
    </div>
</template>