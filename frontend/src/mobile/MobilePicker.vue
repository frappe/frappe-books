<template>
  <DialogRoot v-model:open="isOpen">
    <DialogPortal :to="portalTarget">
      <DialogContent
        :aria-describedby="undefined"
        class="fixed inset-0 z-50 flex flex-col bg-surface-base pt-[env(safe-area-inset-top)] focus:outline-none"
        @open-auto-focus="focusSearch"
      >
        <div
          class="relative flex h-13 shrink-0 items-center border-b border-outline-gray-1 px-3"
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
          class="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-outline-gray-1 pb-[env(safe-area-inset-bottom)]"
        >
          <FrappeList
            role="listbox"
            :aria-label="title"
            class="list-gap-3 list-row-px-4"
          >
            <FrappeListRow
              v-for="option in sortedOptions"
              :key="getKey(option)"
              role="option"
              :class="option.actionOnly ? 'h-13' : 'min-h-15 py-2'"
              @click="$emit('select', option)"
            >
              <FrappeListCell>
                <FrappeAvatar
                  v-if="option.actionOnly"
                  size="xl"
                  aria-hidden="true"
                >
                  <span :class="option.icon ?? 'lucide-plus'" class="size-4" />
                </FrappeAvatar>
                <FrappeAvatar
                  v-else
                  size="xl"
                  aria-hidden="true"
                  :label="getLabel(option)"
                />
              </FrappeListCell>
              <FrappeListCell>
                <div class="min-w-0">
                  <div class="truncate text-lg text-ink-gray-8">
                    {{ getLabel(option) }}
                  </div>
                  <div
                    v-if="getMeta(option)"
                    class="mt-0.5 truncate text-md text-ink-gray-5"
                  >
                    {{ getMeta(option) }}
                  </div>
                </div>
              </FrappeListCell>
            </FrappeListRow>
          </FrappeList>
          <p
            v-if="loading && !options.length"
            class="px-3 py-10 text-center text-p-sm text-ink-gray-4"
          >
            {{ t`Loading...` }}
          </p>
          <p
            v-else-if="!sortedOptions.length"
            class="px-3 py-10 text-center text-p-sm text-ink-gray-4"
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
  Avatar as FrappeAvatar,
  Button as FrappeButton,
  TextInput as FrappeTextInput,
  usePortalTarget,
} from 'frappe-ui';
import {
  List as FrappeList,
  ListCell as FrappeListCell,
  ListRow as FrappeListRow,
} from 'frappe-ui/list';
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

function getKey(option: PickerOption) {
  return `${option.actionOnly ? 'action' : 'option'}-${getLabel(option)}-${String(option.value ?? '')}`;
}
</script>
