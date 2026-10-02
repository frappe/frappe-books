<template>
  <FrappeTree
    v-model:expanded="expanded"
    :nodes="nodes"
    node-key="path"
    :aria-label="t`Template keys`"
  >
    <template #item-label="{ node }">
      <span class="min-w-0 truncate text-sm text-ink-gray-6">
        {{ node.label }}
      </span>
    </template>
    <template #item-suffix="{ node }">
      <FrappeBadge
        v-if="node.children"
        :theme="node.isArray ? 'blue' : 'red'"
        size="sm"
      >
        {{ node.isArray ? t`Array` : t`Object` }}
      </FrappeBadge>
      <span v-else class="truncate text-sm-semibold text-ink-gray-8">
        {{ node.value }}
      </span>
    </template>
  </FrappeTree>
</template>
<script lang="ts">
import { Badge as FrappeBadge, Tree as FrappeTree } from 'frappe-ui';
import { PrintHints } from 'src/utils/printFormats';
import { defineComponent, PropType } from 'vue';

type HintNode = {
  path: string;
  label: string;
  value?: string;
  isArray?: boolean;
  children?: HintNode[];
};

export default defineComponent({
  name: 'TemplateBuilderHint',
  components: { FrappeBadge, FrappeTree },
  props: {
    hints: {
      type: Object as PropType<PrintHints>,
      required: true,
    },
  },
  data() {
    return { expanded: [] as string[] };
  },
  computed: {
    nodes(): HintNode[] {
      return getHintNodes(this.hints, '');
    },
  },
  watch: {
    nodes: {
      handler(nodes: HintNode[]) {
        this.expanded = nodes
          .filter((node) => node.children)
          .map((node) => node.path);
      },
      immediate: true,
    },
  },
});

/** Leaf keys first, then objects and arrays, as template paths. */
function getHintNodes(hints: PrintHints, prefix: string): HintNode[] {
  return Object.entries(hints)
    .map(([key, value]): HintNode => {
      if (typeof value === 'string') {
        const path = prefix ? `${prefix}.${key}` : key;
        return { path, label: path, value };
      }

      const isArray = Array.isArray(value);
      const path = isArray ? `${prefix}.${key}[number]` : prefix ? `${prefix}.${key}` : key;
      const children = getHintNodes(Array.isArray(value) ? value[0] : value, path);
      return { path, label: path, isArray, children };
    })
    .sort((a, b) => Number(!!a.children) - Number(!!b.children));
}
</script>
