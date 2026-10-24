<template>
  <FrappeAlert
    ref="panel"
    theme="red"
    :title="title"
    dismissible
    @dismiss="$emit('dismiss')"
  >
    <template #description>
      <!-- The server's HTML, with only text markup, lists, tables and links left; see sanitizeServerHtml. -->
      <div :class="MESSAGES_CLASSES" @click="openLink">
        <div
          v-for="(html, index) of messageHtml"
          :key="index"
          class="py-2 first:pt-0 last:pb-0"
          v-html="html"
        />
      </div>
    </template>
  </FrappeAlert>
</template>
<script setup lang="ts">
import { Alert as FrappeAlert } from 'frappe-ui';
import { t } from 'fyo';
import { getFormRoute, routeTo } from 'src/utils/ui';
import { getSchema, getSchemaDoctypes } from 'src/frappe/registry';
import { sanitizeServerHtml } from 'src/utils/serverHtml';
import type { ServerMessage } from 'src/web/api';
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue';

/** Accessory mode: why ERPNext refused a save or submit, as it said it. */
const props = defineProps<{
  action: 'save' | 'submit';
  messages: ServerMessage[];
}>();
defineEmits<{ dismiss: [] }>();

// The server's markup, styled in place: underlined links, list markers, hairline tables that scroll sideways.
const MESSAGES_CLASSES = [
  'divide-y divide-outline-gray-1 md:max-h-[360px] md:overflow-y-auto',
  '[&_a]:text-ink-gray-8 [&_a]:underline [&_p+p]:mt-1',
  '[&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5',
  '[&_[data-table]]:my-2 [&_[data-table]]:overflow-x-auto [&_[data-table]]:rounded [&_[data-table]]:border [&_[data-table]]:border-outline-gray-2',
  '[&_table]:w-full [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:text-[13px]',
  '[&_th]:bg-surface-gray-1 [&_th]:font-normal [&_th]:text-ink-gray-5',
  '[&_td]:whitespace-nowrap [&_td]:border-b [&_td]:border-outline-gray-1 [&_td]:px-2 [&_td]:py-1.5 [&_td]:text-start',
  '[&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-outline-gray-1 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-start',
  '[&_tr:last-child>td]:border-b-0 [&_[data-number]]:text-end [&_[data-number]]:tabular-nums',
];

// Frappe titles a message it was given no title for with these.
const DEFAULT_TITLES = ['Message', 'Error', t`Message`, t`Error`];

const title = computed(() => {
  const action =
    props.action === 'submit' ? t`Couldn't submit` : t`Couldn't save`;
  const serverTitle = props.messages
    .map((message) => message.title?.trim())
    .find((text) => text && !DEFAULT_TITLES.includes(text));
  return serverTitle ? `${action} · ${serverTitle}` : action;
});

const messageHtml = computed(() =>
  props.messages.map(({ message }) => sanitizeServerHtml(message))
);

const panel = useTemplateRef<{ $el: HTMLElement }>('panel');

/** A failure brings the panel into view. */
async function reveal() {
  await nextTick();
  panel.value?.$el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

onMounted(reveal);
watch(() => props.messages, reveal);

/** A link to a record opens its Books screen when Books has one, else Desk in a new tab. */
async function openLink(event: MouseEvent) {
  const link = (event.target as HTMLElement).closest('a');
  const href = link?.getAttribute('href');
  if (!href) {
    return;
  }

  event.preventDefault();
  const route = getBooksRoute(new URL(href, window.location.origin));
  if (route) {
    await routeTo(route);
  } else {
    window.open(href, '_blank', 'noopener');
  }
}

/** The Books form of a Desk record link, like `/app/sales-invoice/ACC-SINV-0001`. */
function getBooksRoute(url: URL): string | undefined {
  const [, app, slug, name] = url.pathname.split('/');
  if (url.origin !== window.location.origin || app !== 'app' || !name) {
    return undefined;
  }

  const schemaName = Object.entries(getSchemaDoctypes()).find(
    ([, doctype]) => doctype.toLowerCase().replaceAll(' ', '-') === slug
  )?.[0];
  if (!schemaName || getSchema(schemaName)?.isChild) {
    return undefined;
  }

  return getFormRoute(schemaName, decodeURIComponent(name));
}
</script>
