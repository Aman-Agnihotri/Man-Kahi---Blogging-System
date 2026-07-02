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
                <form v-if="!submitted" @submit.prevent="handleSubmit" class="space-y-6">
                    <div>
                        <label class="block text-sm font-medium text-primary-700 mb-2">Name</label>
                        <input v-model="name" type="text" required
                            class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-primary-700 mb-2">Email</label>
                        <input v-model="email" type="email" required
                            class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-primary-700 mb-2">Message</label>
                        <textarea v-model="message" rows="4" required
                            class="w-full rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"></textarea>
                    </div>
                    <button type="submit" class="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                        Send Message
                    </button>
                </form>
                <p v-else class="text-primary-700">
                    Thanks for reaching out! There's no support inbox wired up in this environment yet, but your
                    message would be on its way.
                </p>
            </div>
        </main>
    </div>
</template>

<script setup lang="ts">
// No backend contact endpoint exists (out of scope for this pass) - this
// just acknowledges the submission locally rather than pretending to send
// it, or leaving the button silently broken.
const name = ref('');
const email = ref('');
const message = ref('');
const submitted = ref(false);

function handleSubmit() {
    submitted.value = true;
}
</script>