<template>
  <div class="min-h-screen bg-primary-50">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <h1 class="text-3xl font-bold text-primary-900 mb-8">User Management</h1>

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
          class="px-4 py-2 rounded-full text-sm font-medium bg-primary-600 text-white"
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
      <div v-if="rolesError" class="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6">
        {{ rolesError }}
      </div>

      <!-- Filters -->
      <form class="flex flex-wrap gap-3 mb-6" @submit.prevent="onSearchSubmit">
        <input
          v-model="searchInput"
          type="search"
          placeholder="Search by username or email..."
          class="flex-1 min-w-[200px] rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
        >
        <select
          v-model="statusFilter"
          class="rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
          @change="onFilterChange"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </select>
        <button
          type="submit"
          class="px-6 py-2 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors"
        >
          Search
        </button>
      </form>

      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <div v-if="listLoading" class="p-6 space-y-4">
          <div v-for="i in 5" :key="i" class="h-10 w-full bg-primary-200 animate-pulse rounded"></div>
        </div>

        <div v-else-if="!users.length" class="p-12 text-center text-primary-600">
          No users found.
        </div>

        <table v-else class="min-w-full divide-y divide-primary-200">
          <thead class="bg-primary-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Username
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Email
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Joined
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-primary-500 uppercase tracking-wider">
                Last Login
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
            <template v-for="user in users" :key="user.id">
              <tr>
                <td class="px-6 py-4">
                  <div class="text-sm font-medium text-primary-900">{{ user.username }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-primary-600">
                  {{ user.email }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-primary-600">
                  {{ formatDate(user.createdAt) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-primary-600">
                  {{ user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="statusBadgeClass(user)">{{ statusLabel(user) }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                  <button
                    v-if="!user.suspendedAt && !user.deletedAt"
                    class="text-red-600 hover:text-red-900 disabled:opacity-50"
                    :disabled="actioningId === user.id"
                    @click="startSuspend(user)"
                  >
                    Suspend
                  </button>
                  <button
                    v-else-if="user.suspendedAt && !user.deletedAt"
                    class="text-primary-600 hover:text-primary-900 disabled:opacity-50"
                    :disabled="actioningId === user.id"
                    @click="handleUnsuspend(user)"
                  >
                    Unsuspend
                  </button>
                  <button
                    class="text-primary-600 hover:text-primary-900"
                    @click="toggleRolesPanel(user.id)"
                  >
                    {{ rolesPanelUserId === user.id ? 'Close Roles' : 'Manage Roles' }}
                  </button>
                </td>
              </tr>

              <!-- Suspend reason input -->
              <tr v-if="suspendingUserId === user.id">
                <td colspan="6" class="px-6 py-4 bg-primary-50">
                  <div class="flex items-center gap-3">
                    <input
                      v-model="suspendReason"
                      type="text"
                      placeholder="Reason for suspension..."
                      class="flex-1 rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
                    >
                    <button
                      class="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"
                      :disabled="actioningId === user.id || !suspendReason.trim()"
                      @click="handleSuspend(user)"
                    >
                      Confirm Suspend
                    </button>
                    <button
                      class="px-4 py-2 border border-primary-200 text-sm font-medium rounded-lg hover:bg-primary-100"
                      @click="cancelSuspend"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>

              <!-- Roles panel -->
              <tr v-if="rolesPanelUserId === user.id">
                <td colspan="6" class="px-6 py-4 bg-primary-50">
                  <div class="text-sm text-primary-700 mb-3">
                    Note: the API has no endpoint to read a user's current roles, so this panel only
                    offers "assign" / "revoke" actions - it cannot display which roles this user
                    currently holds.
                  </div>
                  <div v-if="rolesLoading" class="text-sm text-primary-500">Loading roles...</div>
                  <div v-else class="flex flex-wrap items-end gap-3">
                    <div>
                      <label class="block text-xs font-medium text-primary-500 uppercase tracking-wider mb-1">
                        Role
                      </label>
                      <select
                        v-model="selectedRoleId[user.id]"
                        class="rounded-lg border-primary-200 focus:border-primary-500 focus:ring-primary-500"
                      >
                        <option v-for="role in roles" :key="role.id" :value="role.id">
                          {{ role.name }}
                        </option>
                      </select>
                    </div>
                    <button
                      class="px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50"
                      :disabled="!selectedRoleId[user.id] || roleActionPending"
                      @click="handleAssignRole(user)"
                    >
                      Assign Role
                    </button>
                    <button
                      class="px-4 py-2 border border-red-200 text-red-700 text-sm font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50"
                      :disabled="!selectedRoleId[user.id] || roleActionPending"
                      @click="handleRevokeRole(user)"
                    >
                      Revoke Role
                    </button>
                    <span v-if="roleActionMessage[user.id]" class="text-sm text-primary-600">
                      {{ roleActionMessage[user.id] }}
                    </span>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>

        <div v-if="!listLoading && users.length" class="px-6 py-4 border-t border-primary-200">
          <div class="flex items-center justify-between">
            <p class="text-sm text-primary-500">
              Showing {{ rangeStart }}-{{ rangeEnd }} of {{ total }} users
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
import type { AdminUser, AdminRole } from '~/types/admin';

definePageMeta({ requiresAuth: true, requiresAdmin: true });

const adminApi = useAdminApi();

const limit = 10;
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const users = ref<AdminUser[]>([]);
const listLoading = ref(true);
const listError = ref<string | null>(null);

const searchInput = ref('');
const search = ref('');
const statusFilter = ref<'' | 'active' | 'suspended' | 'deleted'>('');

const actioningId = ref<string | null>(null);
const actionError = ref<string | null>(null);

const suspendingUserId = ref<string | null>(null);
const suspendReason = ref('');

// Role management: getUsers()/AdminUser never includes a user's current roles, and there is
// no "get roles for user X" endpoint - only assignRole/revokeRole mutation primitives exist.
// Rather than fake a checkbox list that implies knowledge of current role membership, this
// panel exposes plain "Assign Role" / "Revoke Role" actions against the full role catalog.
const roles = ref<AdminRole[]>([]);
const rolesLoading = ref(false);
const rolesError = ref<string | null>(null);
const rolesPanelUserId = ref<string | null>(null);
const selectedRoleId = reactive<Record<string, string>>({});
const roleActionPending = ref(false);
const roleActionMessage = reactive<Record<string, string>>({});

const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * limit + 1));
const rangeEnd = computed(() => Math.min(page.value * limit, total.value));

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusLabel(user: AdminUser) {
  if (user.deletedAt) return 'Deleted';
  if (user.suspendedAt) return 'Suspended';
  return 'Active';
}

function statusBadgeClass(user: AdminUser) {
  return {
    'px-2 py-1 text-xs font-medium rounded-full': true,
    'bg-green-100 text-green-800': !user.suspendedAt && !user.deletedAt,
    'bg-yellow-100 text-yellow-800': !!user.suspendedAt && !user.deletedAt,
    'bg-gray-200 text-gray-700': !!user.deletedAt,
  };
}

async function loadUsers() {
  listLoading.value = true;
  listError.value = null;
  try {
    const res = await adminApi.getUsers(
      page.value,
      limit,
      search.value || undefined,
      statusFilter.value || undefined,
    );
    users.value = res.users;
    total.value = res.total;
    totalPages.value = res.totalPages;
  } catch (e: any) {
    listError.value = e?.message ?? 'Failed to load users.';
  } finally {
    listLoading.value = false;
  }
}

function onSearchSubmit() {
  search.value = searchInput.value.trim();
  page.value = 1;
  loadUsers();
}

function onFilterChange() {
  page.value = 1;
  loadUsers();
}

function goToPage(next: number) {
  if (next < 1 || next > totalPages.value || next === page.value) return;
  page.value = next;
  loadUsers();
}

function startSuspend(user: AdminUser) {
  actionError.value = null;
  suspendingUserId.value = user.id;
  suspendReason.value = '';
}

function cancelSuspend() {
  suspendingUserId.value = null;
  suspendReason.value = '';
}

async function handleSuspend(user: AdminUser) {
  if (!suspendReason.value.trim()) return;
  actionError.value = null;
  actioningId.value = user.id;
  try {
    const updated = await adminApi.suspendUser(user.id, suspendReason.value.trim());
    const target = users.value.find((u) => u.id === user.id);
    if (target) target.suspendedAt = updated.suspendedAt;
    suspendingUserId.value = null;
    suspendReason.value = '';
  } catch (e: any) {
    actionError.value = e?.message ?? 'Failed to suspend user.';
  } finally {
    actioningId.value = null;
  }
}

async function handleUnsuspend(user: AdminUser) {
  actionError.value = null;
  actioningId.value = user.id;
  try {
    const updated = await adminApi.unsuspendUser(user.id);
    const target = users.value.find((u) => u.id === user.id);
    if (target) target.suspendedAt = updated.suspendedAt;
  } catch (e: any) {
    actionError.value = e?.message ?? 'Failed to unsuspend user.';
  } finally {
    actioningId.value = null;
  }
}

async function ensureRolesLoaded() {
  if (roles.value.length || rolesLoading.value) return;
  rolesLoading.value = true;
  rolesError.value = null;
  try {
    roles.value = await adminApi.getRoles();
  } catch (e: any) {
    rolesError.value = e?.message ?? 'Failed to load roles.';
  } finally {
    rolesLoading.value = false;
  }
}

function toggleRolesPanel(userId: string) {
  if (rolesPanelUserId.value === userId) {
    rolesPanelUserId.value = null;
    return;
  }
  rolesPanelUserId.value = userId;
  ensureRolesLoaded();
}

async function handleAssignRole(user: AdminUser) {
  const roleId = selectedRoleId[user.id];
  if (!roleId) return;
  roleActionPending.value = true;
  roleActionMessage[user.id] = '';
  try {
    await adminApi.assignRole(user.id, roleId);
    const role = roles.value.find((r) => r.id === roleId);
    roleActionMessage[user.id] = `Assigned "${role?.name ?? roleId}".`;
  } catch (e: any) {
    roleActionMessage[user.id] = e?.message ?? 'Failed to assign role.';
  } finally {
    roleActionPending.value = false;
  }
}

async function handleRevokeRole(user: AdminUser) {
  const roleId = selectedRoleId[user.id];
  if (!roleId) return;
  roleActionPending.value = true;
  roleActionMessage[user.id] = '';
  try {
    await adminApi.revokeRole(user.id, roleId);
    const role = roles.value.find((r) => r.id === roleId);
    roleActionMessage[user.id] = `Revoked "${role?.name ?? roleId}".`;
  } catch (e: any) {
    roleActionMessage[user.id] = e?.message ?? 'Failed to revoke role.';
  } finally {
    roleActionPending.value = false;
  }
}

onMounted(() => {
  loadUsers();
});
</script>
