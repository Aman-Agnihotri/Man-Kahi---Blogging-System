<template>
    <div class="min-h-screen bg-primary-50">
        <TheHeader />
        <main>
            <Suspense>
                <template #default>
                    <NuxtPage />
                </template>
                <template #fallback>
                    <div class="flex items-center justify-center py-16">
                        <div class="space-y-8 w-full max-w-6xl mx-auto px-4">
                            <!-- Hero Section Skeleton -->
                            <div class="text-center">
                                <div class="h-12 w-3/4 max-w-2xl mx-auto bg-primary-200 animate-pulse rounded mb-6">
                                </div>
                                <div class="h-8 w-2/3 max-w-xl mx-auto bg-primary-200 animate-pulse rounded mb-8"></div>
                                <div class="h-12 w-40 mx-auto bg-primary-300 animate-pulse rounded-lg"></div>
                            </div>

                            <!-- Content Section Skeleton -->
                            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
                                <div v-for="i in 3" :key="i" class="bg-white rounded-xl shadow-sm overflow-hidden">
                                    <div class="w-full h-48 bg-primary-200 animate-pulse"></div>
                                    <div class="p-6 space-y-4">
                                        <div class="h-6 w-3/4 bg-primary-200 animate-pulse rounded"></div>
                                        <div class="h-4 w-full bg-primary-200 animate-pulse rounded"></div>
                                        <div class="h-4 w-2/3 bg-primary-200 animate-pulse rounded"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
            </Suspense>
        </main>
        <TheFooter />
    </div>
</template>
