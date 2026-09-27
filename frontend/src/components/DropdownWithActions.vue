<template>
  <Dropdown
    v-if="actions && actions.length"
    class="text-xs"
    :items="items"
    :doc="doc"
    :disabled="disabled"
    right
  >
    <template #default>
      <FrappeButton v-if="$slots.default" :variant="variant" :disabled="disabled">
        <slot />
      </FrappeButton>
      <FrappeButton
        v-else
        :variant="variant"
        icon="lucide-ellipsis"
        :label="label || t`Actions`"
        :tooltip="label || t`Actions`"
        :disabled="disabled"
      />
    </template>
  </Dropdown>
</template>

<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { Doc } from 'fyo/model/doc';
import { Action } from 'fyo/model/types';
import Dropdown from 'src/components/Dropdown.vue';
import { DropdownItem } from 'src/utils/types';
import { defineComponent, PropType } from 'vue';

export default defineComponent({
  name: 'DropdownWithActions',
  components: {
    Dropdown,
    FrappeButton,
  },
  inject: {
    injectedDoc: {
      from: 'doc',
      default: undefined,
    },
  },
  props: {
    actions: { type: Array as PropType<Action[]>, default: () => [] },
    type: { type: String, default: 'secondary' },
    label: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
  },
  computed: {
    variant(): 'solid' | 'subtle' {
      return this.type === 'primary' ? 'solid' : 'subtle';
    },
    doc() {
      const doc = this.injectedDoc;
      if (doc instanceof Doc) {
        return doc;
      }

      return undefined;
    },
    items(): DropdownItem[] {
      return this.actions.map(({ label, group, theme, action }) => ({
        label,
        group,
        action,
        theme,
      }));
    },
  },
});
</script>
