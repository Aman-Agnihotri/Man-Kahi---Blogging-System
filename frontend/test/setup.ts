import { vi } from 'vitest';
import * as vue from 'vue';

vi.stubGlobal('ref', vue.ref);
vi.stubGlobal('computed', vue.computed);
vi.stubGlobal('reactive', vue.reactive);
vi.stubGlobal('watch', vue.watch);
vi.stubGlobal('watchEffect', vue.watchEffect);
vi.stubGlobal('onMounted', vue.onMounted);
vi.stubGlobal('onBeforeMount', vue.onBeforeMount);
vi.stubGlobal('onUnmounted', vue.onUnmounted);
vi.stubGlobal('nextTick', vue.nextTick);
vi.stubGlobal('toRefs', vue.toRefs);
vi.stubGlobal('provide', vue.provide);
vi.stubGlobal('inject', vue.inject);

vi.stubGlobal('definePageMeta', () => {});
vi.stubGlobal('navigateTo', vi.fn());
