<template>
  <Link
    v-if="isChanging"
    ref="link"
    v-bind="$attrs"
    :df="linkField"
    :value="value ?? undefined"
    :show-label="true"
    :border="true"
    :focus-input="!isMobile"
    @change="onPick"
  />
  <div
    v-else-if="value"
    class="flex items-start gap-3 rounded-6 border border-outline-gray-1 px-3.5 py-3"
    :data-fieldname="df.fieldname"
  >
    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <span class="truncate text-base-medium text-ink-gray-9">
        {{ card?.title ?? value }}
      </span>
      <div
        v-for="line in card?.lines ?? []"
        :key="line.text"
        class="flex min-w-0 items-center gap-2 text-base text-ink-gray-7"
      >
        <span
          v-if="line.icon"
          class="size-3.5 shrink-0 text-ink-gray-5"
          :class="line.icon"
          aria-hidden="true"
        />
        <span class="truncate">{{ line.text }}</span>
      </div>
    </div>
    <div class="flex shrink-0 gap-1">
      <FrappeButton
        v-if="canOpen"
        variant="ghost"
        icon-left="lucide-arrow-up-right"
        :label="t`Open`"
        @click="open"
      />
      <FrappeButton
        v-if="canChange"
        variant="subtle"
        :label="t`Change`"
        @click="change"
      />
    </div>
  </div>
  <div
    v-else
    class="flex items-center justify-between gap-3 rounded-6 border border-outline-gray-1 px-3.5 py-3"
    :data-fieldname="df.fieldname"
  >
    <span class="text-base text-ink-gray-5">{{ df.placeholder }}</span>
    <FrappeButton
      v-if="canChange"
      variant="subtle"
      :label="t`Select`"
      @click="change"
    />
  </div>
</template>
<script setup lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { t } from 'fyo';
import type { TargetField } from 'schemas/types';
import { getDocuments } from 'src/frappe/api';
import { getDocType } from 'src/frappe/doctypes';
import { FrappeDoc, type LinkCardContent } from 'src/frappe/document';
import { getModel } from 'src/frappe/registry';
import { fyo } from 'src/initFyo';
import { isMobile } from 'src/utils/viewport';
import {
  computed,
  inject,
  nextTick,
  ref,
  unref,
  watch,
  type ComputedRef,
} from 'vue';
import Link from './Link.vue';

/**
 * A Link shown as a card of its record, like a party's primary contact: Open
 * goes to the record, and Change turns it back into the Link to pick another.
 */
defineOptions({ inheritAttrs: false });
const props = defineProps<{ df: TargetField; value?: string | null }>();
const emit = defineEmits<{ change: [value: string | null] }>();

const injected = inject<ComputedRef<FrappeDoc | null> | undefined>(
  'doc',
  undefined
);
const doc = computed(() => unref(injected) ?? undefined);
const link = ref<{ openPicker?: () => void } | null>(null);
const isChanging = ref(false);
const card = ref<LinkCardContent>();

const linkField = computed(() => ({ ...props.df, card: false }));
const canOpen = computed(() => fyo.can(props.df.target, 'read'));
const canChange = computed(
  () => !!doc.value && !doc.value.getFieldState(props.df).readOnly
);

watch(() => props.value, loadCard, { immediate: true });

/** The card of the linked record, from the fields its model's card reads. */
async function loadCard() {
  const linkCard = getModel(props.df.target)?.linkCard;
  if (!props.value || !linkCard) {
    card.value = undefined;
    return;
  }

  const [record] = await getDocuments(getDocType(props.df.target).doctype, {
    fields: ['name', ...linkCard.fields],
    filters: [['name', '=', props.value]],
    limit: 1,
  });
  card.value = record ? linkCard.getContent(record) : undefined;
}

async function change() {
  isChanging.value = true;
  // A phone picks from a sheet, which opens at once.
  if (isMobile.value) {
    await nextTick();
    link.value?.openPicker?.();
  }
}

function onPick(value: string | null) {
  isChanging.value = false;
  emit('change', value);
}

async function open() {
  // Imported on use: src/utils/ui imports the router, whose pages import this control.
  const { getFormRoute, routeTo } = await import('src/utils/ui');
  await routeTo(getFormRoute(props.df.target, props.value!));
}
</script>
