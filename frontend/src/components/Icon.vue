<template>
  <FrappeIcon
    :icon="resolvedName"
    :class="iconClasses"
    :style="iconStyle"
    v-bind="$attrs"
  />
</template>

<script lang="ts">
import { Icon as FrappeIcon } from 'frappe-ui';
import { defineComponent, PropType } from 'vue';

const iconAliases: Record<string, string> = {
  'arrow-left-right': 'lucide-arrow-left-right',
  'arrow-right': 'lucide-arrow-right',
  'check': 'lucide-check',
  'chevron-left': 'lucide-chevron-left',
  'chevron-right': 'lucide-chevron-right',
  'chevrons-left': 'lucide-chevrons-left',
  'chevrons-right': 'lucide-chevrons-right',
  'circle': 'lucide-circle',
  'coins': 'lucide-coins',
  'common-entries': 'lucide-notebook-tabs',
  'command': 'lucide-command',
  'customer': 'lucide-user-round',
  'dashboard': 'lucide-layout-dashboard',
  'database': 'lucide-database',
  'dot-horizontal': 'lucide-ellipsis',
  'dot-vertical': 'lucide-ellipsis-vertical',
  'download': 'lucide-download',
  'drag-handle': 'lucide-grip-vertical',
  'edit': 'lucide-square-pen',
  'fb': 'lucide-book-open',
  'filter': 'lucide-list-filter',
  'flag': 'lucide-flag',
  'folder': 'lucide-folder',
  'general': 'lucide-wrench',
  'green-check': 'lucide-circle-check-big',
  'gst': 'lucide-badge-indian-rupee',
  'hand-coins': 'lucide-hand-coins',
  'help-circle': 'lucide-circle-help',
  'inventory': 'lucide-package',
  'invoice': 'lucide-receipt-text',
  'item': 'lucide-box',
  'link': 'lucide-link',
  'list': 'lucide-list',
  'mail': 'lucide-mail',
  'maximize': 'lucide-maximize-2',
  'minimize': 'lucide-minimize-2',
  'more-horizontal': 'lucide-ellipsis',
  'opening-ac': 'lucide-landmark',
  'pencil': 'lucide-pencil',
  'percentage': 'lucide-percent',
  'plus': 'lucide-plus',
  'pos': 'lucide-store',
  'printer': 'lucide-printer',
  'property': 'lucide-building-2',
  'purchase-invoice': 'lucide-receipt-indian-rupee',
  'purchase': 'lucide-shopping-bag',
  'refresh-cw': 'lucide-refresh-cw',
  'reports': 'lucide-chart-no-axes-combined',
  'review-ac': 'lucide-clipboard-check',
  'sales-invoice': 'lucide-receipt-text',
  'sales': 'lucide-credit-card',
  'select': 'lucide-chevrons-up-down',
  'settings': 'lucide-sliders-horizontal',
  'sidebar': 'lucide-panel-left',
  'start': 'lucide-rocket',
  'supplier': 'lucide-truck',
  'system': 'lucide-settings',
  'trash': 'lucide-trash-2',
  'up': 'lucide-chevrons-up-down',
  'x': 'lucide-x',
};

const sizeClasses: Record<string, string> = {
  '8': 'size-2',
  '12': 'size-3',
  '16': 'size-4',
  '18': 'size-5',
  '20': 'size-5',
  '24': 'size-6',
};

export default defineComponent({
  name: 'BooksIcon',
  components: { FrappeIcon },
  inheritAttrs: false,
  props: {
    name: { type: String, required: true },
    active: { type: Boolean, default: undefined },
    darkMode: { type: Boolean, default: false },
    size: {
      type: [String, Number] as PropType<string | number>,
      default: 16,
    },
    height: Number,
  },
  computed: {
    resolvedName(): string {
      if (this.name.startsWith('lucide-')) {
        return this.name;
      }

      return iconAliases[this.name] ?? `lucide-${this.name}`;
    },
    iconClasses(): Array<string | undefined> {
      return [
        this.height || this.hasCustomSize
          ? undefined
          : sizeClasses[String(this.size)] ?? 'size-4',
        this.name === 'green-check' ? 'text-ink-green-5' : undefined,
        this.active === true
          ? 'text-ink-gray-8'
          : undefined,
        this.active === false
          ? 'text-ink-gray-6'
          : undefined,
        'shrink-0',
      ];
    },
    hasCustomSize(): boolean {
      const classes = Array.isArray(this.$attrs.class)
        ? this.$attrs.class.join(' ')
        : String(this.$attrs.class ?? '');

      return /(?:^|\s)!?(?:size|w|h)-\S+/.test(classes);
    },
    iconStyle(): Record<string, string> | undefined {
      if (!this.height) {
        return undefined;
      }

      const dimension = `${this.height * 0.25}rem`;
      return { width: dimension, height: dimension };
    },
  },
});
</script>
