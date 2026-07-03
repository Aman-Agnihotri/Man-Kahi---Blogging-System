<template>
  <div class="min-h-screen bg-primary-50">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <h1 class="text-3xl font-bold text-primary-900 mb-8">Reported Content</h1>

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
          class="px-4 py-2 rounded-full text-sm font-medium bg-primary-600 text-white"
        >
          Reports
        </NuxtLink>
        <NuxtLink
          to="/admin/audit-log"
          class="px-4 py-2 rounded-full text-sm font-medium bg-white text-primary-700 hover:bg-primary-100"
        >
          Audit Log
        </NuxtLink>
      </div>

      <div v-if="listError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
        {{ listError }}
      </div>
      <div v-if="actionError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
        {{ actionError }}
      </div>

      <!-- Filter -->
      <div class="flex flex-wrap gap-3 mb-6">
        <select
          v-model="statusFilter"
          class="rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
          @change="onFilterChange"
        >
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <div v-if="listLoading" class="p-6 space-y-4">
          <div v-for="i in 5" :key="i" class="h-10 w-full bg-primary-200 animate-pulse rounded"></div>
        </div>

        <div v-else-if="!reports.length" class="p-12 text-center text-primary-600">
          No reports found.
        </div>

        <table v-else class="min-w-full divide-y divide-primary-200">
          <thead class="bg-primary-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Target
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Reason
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Reporter
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Reported
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Status
              </th>
              <th class="px-6 py-3 text-right text-xs font-medium text-primary-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-primary-200">
            <template v-for="report in reports" :key="report.id">
              <tr>
                <td class="px-6 py-4">
                  <div class="text-sm font-medium text-primary-900">
                    {{ report.targetType }} #{{ report.targetId }}
                  </div>
                </td>
                <td class="px-6 py-4 text-sm text-primary-600 max-w-xs">
                  {{ report.reason }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-primary-600">
                  {{ report.reporter.username }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-primary-600">
                  <div>{{ formatDate(report.createdAt) }}</div>
                  <div v-if="report.resolvedAt" class="text-xs text-primary-400">
                    Resolved {{ formatDate(report.resolvedAt) }}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="statusBadgeClass(report.status)">{{ statusLabel(report.status) }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                  <template v-if="report.status === 'open'">
                    <button
                      class="text-primary-600 hover:text-primary-900 disabled:opacity-50"
                      :disabled="actioningId === report.id"
                      @click="startResolve(report)"
                    >
                      Resolve
                    </button>
                    <button
                      class="text-red-600 hover:text-red-900 disabled:opacity-50"
                      :disabled="actioningId === report.id"
                      @click="handleDismiss(report)"
                    >
                      Dismiss
                    </button>
                  </template>
                  <span v-else class="text-primary-400">No actions</span>
                </td>
              </tr>

              <!-- Resolve action-taken input -->
              <tr v-if="resolvingReportId === report.id">
                <td colspan="6" class="px-6 py-4 bg-primary-50">
                  <div class="flex items-center gap-3">
                    <input
                      v-model="resolveActionTaken"
                      type="text"
                      placeholder="Action taken (optional)..."
                      class="flex-1 rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
                    >
                    <button
                      class="px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50"
                      :disabled="actioningId === report.id"
                      @click="handleResolve(report)"
                    >
                      Confirm Resolve
                    </button>
                    <button
                      class="px-4 py-2 border border-primary-200 text-sm font-medium rounded-lg hover:bg-primary-100"
                      @click="cancelResolve"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>

        <div v-if="!listLoading && reports.length" class="px-6 py-4 border-t border-primary-200">
          <div class="flex items-center justify-between">
            <p class="text-sm text-primary-500">
              Showing {{ rangeStart }}-{{ rangeEnd }} of {{ total }} reports
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
import type { AdminReport } from '~/types/admin';

definePageMeta({ requiresAuth: true, requiresAdmin: true });

const adminApi = useAdminApi();

const limit = 10;
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const reports = ref<AdminReport[]>([]);
const listLoading = ref(true);
const listError = ref<string | null>(null);

const statusFilter = ref<'open' | 'resolved' | 'dismissed'>('open');

const actioningId = ref<string | null>(null);
const actionError = ref<string | null>(null);

const resolvingReportId = ref<string | null>(null);
const resolveActionTaken = ref('');

const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * limit + 1));
const rangeEnd = computed(() => Math.min(page.value * limit, total.value));

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusLabel(status: AdminReport['status']) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusBadgeClass(status: AdminReport['status']) {
  return {
    'px-2 py-1 text-xs font-medium rounded-full': true,
    'bg-yellow-100 text-yellow-800': status === 'open',
    'bg-green-100 text-green-800': status === 'resolved',
    'bg-gray-200 text-gray-700': status === 'dismissed',
  };
}

async function loadReports() {
  listLoading.value = true;
  listError.value = null;
  try {
    const res = await adminApi.getReports(page.value, limit, statusFilter.value);
    reports.value = res.reports;
    total.value = res.total;
    totalPages.value = res.totalPages;
  } catch (e: any) {
    listError.value = e?.message ?? 'Failed to load reports.';
  } finally {
    listLoading.value = false;
  }
}

function onFilterChange() {
  page.value = 1;
  loadReports();
}

function goToPage(next: number) {
  if (next < 1 || next > totalPages.value || next === page.value) return;
  page.value = next;
  loadReports();
}

function removeFromListIfStale(reportId: string) {
  // The current filter no longer matches a resolved/dismissed report when viewing "open".
  if (statusFilter.value === 'open') {
    reports.value = reports.value.filter((r) => r.id !== reportId);
    total.value = Math.max(0, total.value - 1);
  }
}

function startResolve(report: AdminReport) {
  actionError.value = null;
  resolvingReportId.value = report.id;
  resolveActionTaken.value = '';
}

function cancelResolve() {
  resolvingReportId.value = null;
  resolveActionTaken.value = '';
}

async function handleResolve(report: AdminReport) {
  actionError.value = null;
  actioningId.value = report.id;
  try {
    const updated = await adminApi.resolveReport(report.id, resolveActionTaken.value.trim() || undefined);
    resolvingReportId.value = null;
    resolveActionTaken.value = '';
    if (statusFilter.value === 'open') {
      removeFromListIfStale(report.id);
    } else {
      const target = reports.value.find((r) => r.id === report.id);
      if (target) {
        target.status = updated.status;
        target.resolvedAt = updated.resolvedAt;
        target.resolvedBy = updated.resolvedBy;
      }
    }
  } catch (e: any) {
    actionError.value = e?.message ?? 'Failed to resolve report.';
  } finally {
    actioningId.value = null;
  }
}

async function handleDismiss(report: AdminReport) {
  actionError.value = null;
  actioningId.value = report.id;
  try {
    const updated = await adminApi.dismissReport(report.id);
    if (statusFilter.value === 'open') {
      removeFromListIfStale(report.id);
    } else {
      const target = reports.value.find((r) => r.id === report.id);
      if (target) {
        target.status = updated.status;
        target.resolvedAt = updated.resolvedAt;
        target.resolvedBy = updated.resolvedBy;
      }
    }
  } catch (e: any) {
    actionError.value = e?.message ?? 'Failed to dismiss report.';
  } finally {
    actioningId.value = null;
  }
}

onMounted(() => {
  loadReports();
});
</script>
