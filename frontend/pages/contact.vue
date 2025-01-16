<template>
    <div class="min-h-screen bg-primary-50">
        <header class="bg-white shadow-sm">
            <div class="max-w-7xl mx-auto px-4 py-8">
                <h1 class="text-3xl font-bold text-primary-900">Contact Us</h1>
                <p class="mt-2 text-lg text-primary-600">Get in touch with our team</p>
            </div>
        </header>

        <main class="max-w-3xl mx-auto px-4 py-12">
            <div class="bg-white rounded-xl shadow-sm p-8">
                <form @submit.prevent="handleSubmit" class="space-y-6">
                    <div>
                        <label class="block text-sm font-medium text-primary-700 mb-2">Name</label>
                        <input type="text"
                            class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-primary-700 mb-2">Email</label>
                        <input type="email"
                            class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-primary-700 mb-2">Message</label>
                        <textarea rows="4"
                            class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"></textarea>
                    </div>
                    <button type="submit" class="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                        Send Message
                    </button>
                </form>
            </div>
        </main>
    </div>
</template>