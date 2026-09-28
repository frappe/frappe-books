<template>
  <DialogRoot v-model:open="isOpen">
    <DialogPortal :to="portalTarget">
      <DialogContent
        :aria-describedby="undefined"
        class="fixed inset-0 z-50 flex flex-col bg-surface-base pt-[env(safe-area-inset-top)] focus:outline-none"
        @open-auto-focus="focusSearch"
      >
        <div
          class="relative flex h-[52px] shrink-0 items-center border-b border-outline-gray-1 px-3"
        >
          <FrappeButton
            variant="ghost"
            icon="lucide-chevron-left"
            class="rtl-rotate-180"
            :label="t`Back`"
            @click="isOpen = false"
          />
          <DialogTitle
            class="absolute inset-x-14 truncate text-center text-xl-semibold text-ink-gray-9"
          >
            {{ title }}
          </DialogTitle>
        </div>

        <div class="shrink-0 px-4 py-3">
          <FrappeTextInput
            ref="search"
            type="search"
            size="lg"
            variant="outline"
            :model-value="query"
            :placeholder="t`Search`"
            @update:model-value="(value: string) => (query = value)"
          >
            <template #prefix>
              <span
                class="lucide-search size-4 text-ink-gray-5"
                aria-hidden="true"
              />
            </template>
          </FrappeTextInput>
        </div>

        <div
          role="listbox"
          :aria-label="title"
          class="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-outline-gray-1 pb-[env(safe-area-inset-bottom)]"
        >
          <button
            v-for="option in sortedOptions"
            :key="getKey(option)"
            role="option"
            class="flex w-full items-center gap-3 border-b border-outline-gray-1 px-4 text-start active:bg-surface-gray-1"
            :class="option.actionOnly ? 'h-[52px]' : 'min-h-[60px] py-2'"
            @click="$emit('select', option)"
          >
            <span
              class="grid size-8 shrink-0 place-items-center rounded-full bg-surface-gray-2 text-sm-semibold text-ink-gray-7"
              aria-hidden="true"
            >
              <span
                v-if="option.actionOnly"
                :class="option.icon ?? 'lucide-plus'"
                class="size-4 text-ink-gray-8"
              />
              <template v-else>{{ getInitial(option) }}</template>
            </span>
            <span class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="truncate text-md-medium text-ink-gray-9">
                {{ getLabel(option) }}
              </span>
              <span
                v-if="getMeta(option)"
                class="truncate text-sm text-ink-gray-5"
              >
                {{ getMeta(option) }}
              </span>
            </span>
          </button>
          <p
            v-if="loading && !options.length"
            class="p-4 text-base text-ink-gray-5"
          >
            {{ t`Loading...` }}
          </p>
          <p
            v-else-if="!sortedOptions.length"
            class="p-4 text-base text-ink-gray-5"
          >
            {{ emptyText }}
          </p>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
<script setup lang="ts">
import {
  Button as FrappeButton,
  TextInput as FrappeTextInput,
  usePortalTarget,
} from 'frappe-ui';
import { DialogContent, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { computed, ref } from 'vue';

export interface PickerOption {
  label?: string;
  value?: string | number;
  description?: string;
  group?: string;
  icon?: string;
  actionOnly?: boolean;
}

const props = defineProps<{
  title: string;
  options: PickerOption[];
  loading?: boolean;
  emptyText?: string;
}>();

defineEmits<{ select: [option: PickerOption] }>();

const isOpen = defineModel<boolean>('open', { required: true });
const query = defineModel<string>('query', { required: true });

const portalTarget = usePortalTarget();
const search = ref<{ focus: () => void } | null>(null);

// Actions such as "Create" come first, as the typed text is what they use.
const sortedOptions = computed(() => [
  ...props.options.filter((option) => option.actionOnly),
  ...props.options.filter((option) => !option.actionOnly),
]);

function focusSearch(event: Event) {
  event.preventDefault();
  search.value?.focus();
}

function getLabel(option: PickerOption) {
  return option.label ?? String(option.value ?? '');
}

function getMeta(option: PickerOption) {
  if (option.description) {
    return option.description;
  }

  if (option.group) {
    return option.group;
  }

  if (option.actionOnly) {
    return '';
  }

  return option.value !== option.label ? String(option.value ?? '') : '';
}

function getInitial(option: PickerOption) {
  return getLabel(option).trim().charAt(0).toUpperCase();
}

function getKey(option: PickerOption) {
  return `${option.actionOnly ? 'action' : 'option'}-${getLabel(option)}-${String(option.value ?? '')}`;
}
</script>
