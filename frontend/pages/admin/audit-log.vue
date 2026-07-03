<template>
  <div class="min-h-screen bg-primary-50">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <h1 class="text-3xl font-bold text-primary-900 mb-8">Audit Log</h1>

      <!-- Nav -->
      <div class="flex flex-wrap gap-2 mb-8">
        <NuxtLink
          to="/admin/dashboard"
          class="px-4 py-2 rounded-full text-sm font-medium bg-white text-primary-700 hover:bg-primary-100"
        >
          Dashboard
        </NuxtLink>
        <NuxtLink
          to="/admin/users"
          class="px-4 py-2 rounded-full text-sm font-medium bg-white text-primary-700 hover:bg-primary-100"
        >
          Users
        </NuxtLink>
        <NuxtLink
          to="/admin/reports"
          class="px-4 py-2 rounded-full text-sm font-medium bg-white text-primary-700 hover:bg-primary-100"
        >
          Reports
        </NuxtLink>
        <NuxtLink
          to="/admin/audit-log"
          class="px-4 py-2 rounded-full text-sm font-medium bg-primary-600 text-white"
        >
          Audit Log
        </NuxtLink>
        <NuxtLink
          to="/admin/categories"
          class="px-4 py-2 rounded-full text-sm font-medium bg-white text-primary-700 hover:bg-primary-100"
        >
          Categories
        </NuxtLink>
      </div>

      <div v-if="listError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
        {{ listError }}
      </div>

      <!-- Filter -->
      <form class="flex flex-wrap gap-3 mb-6" @submit.prevent="onFilterSubmit">
        <input
          v-model="actionInput"
          type="search"
          placeholder="Filter by action (e.g. blog, user.suspend)..."
          class="flex-1 min-w-[240px] rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
        >
        <button
          type="submit"
          class="px-6 py-2 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors"
        >
          Filter
        </button>
        <button
          v-if="actionFilter"
          type="button"
          class="px-6 py-2 border border-primary-200 rounded-lg font-medium hover:bg-primary-100"
          @click="clearFilter"
        >
          Clear
        </button>
      </form>

      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <div v-if="listLoading" class="p-6 space-y-4">
          <div v-for="i in 5" :key="i" class="h-10 w-full bg-primary-200 animate-pulse rounded"></div>
        </div>

        <div v-else-if="!logs.length" class="p-12 text-center text-primary-600">
          No audit log entries found.
        </div>

        <table v-else class="min-w-full divide-y divide-primary-200">
          <thead class="bg-primary-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Actor
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Action
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Target
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Timestamp
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Metadata
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-primary-200">
            <tr v-for="log in logs" :key="log.id">
              <td class="px-6 py-4 whitespace-nowrap text-sm text-primary-900">
                {{ log.actor?.username ?? log.actorId }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-mono rounded bg-primary-100 text-primary-800">
                  {{ log.action }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-primary-600">
                {{ log.targetType }} #{{ log.targetId }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-primary-600">
                {{ formatDateTime(log.createdAt) }}
              </td>
              <td class="px-6 py-4 text-sm text-primary-600 max-w-sm">
                <pre v-if="log.metadata" class="whitespace-pre-wrap break-words text-xs bg-primary-50 rounded p-2">{{ formatMetadata(log.metadata) }}</pre>
                <span v-else class="text-primary-400">-</span>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="!listLoading && logs.length" class="px-6 py-4 border-t border-primary-200">
          <div class="flex items-center justify-between">
            <p class="text-sm text-primary-500">
              Showing {{ rangeStart }}-{{ rangeEnd }} of {{ total }} entries
            </p>
            <div class="flex space-x-2">
              <button
                class="px-3 py-1 border border-primary-200 rounded hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="page <= 1 || listLoading"
                @click="goToPage(page - 1)"
              >
                Previous
              </button>
              <button
                class="px-3 py-1 border border-primary-200 rounded hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="page >= totalPages || listLoading"
                @click="goToPage(page + 1)"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AuditLogEntry } from '~/types/admin';

definePageMeta({ requiresAuth: true, requiresAdmin: true });

const adminApi = useAdminApi();

const limit = 20;
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const logs = ref<AuditLogEntry[]>([]);
const listLoading = ref(true);
const listError = ref<string | null>(null);

const actionInput = ref('');
const actionFilter = ref('');

const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * limit + 1));
const rangeEnd = computed(() => Math.min(page.value * limit, total.value));

function formatDateTime(date: string) {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMetadata(metadata: Record<string, unknown>) {
  return JSON.stringify(metadata, null, 2);
}

async function loadLogs() {
  listLoading.value = true;
  listError.value = null;
  try {
    const res = await adminApi.getAuditLog(page.value, limit, actionFilter.value || undefined);
    logs.value = res.logs;
    total.value = res.total;
    totalPages.value = res.totalPages;
  } catch (e: any) {
    listError.value = e?.message ?? 'Failed to load audit log.';
  } finally {
    listLoading.value = false;
  }
}

function onFilterSubmit() {
  actionFilter.value = actionInput.value.trim();
  page.value = 1;
  loadLogs();
}

function clearFilter() {
  actionInput.value = '';
  actionFilter.value = '';
  page.value = 1;
  loadLogs();
}

function goToPage(next: number) {
  if (next < 1 || next > totalPages.value || next === page.value) return;
  page.value = next;
  loadLogs();
}

onMounted(() => {
  loadLogs();
});
</script>
