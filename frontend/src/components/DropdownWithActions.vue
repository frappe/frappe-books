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
      <Button
        :type="type"
        :icon="icon"
        :disabled="disabled"
        :title="$attrs.title || t`Actions`"
      >
        <slot>
          <Icon name="more-horizontal" class="w-4 h-4" />
        </slot>
      </Button>
    </template>
  </Dropdown>
</template>

<script lang="ts">
import { Doc } from 'fyo/model/doc';
import { Action } from 'fyo/model/types';
import Button from 'src/components/Button.vue';
import Dropdown from 'src/components/Dropdown.vue';
import Icon from 'src/components/Icon.vue';
import { DropdownItem } from 'src/utils/types';
import { defineComponent, PropType } from 'vue';

export default defineComponent({
  name: 'DropdownWithActions',
  components: {
    Dropdown,
    Button,
    Icon,
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
    icon: { type: Boolean, default: true },
    disabled: { type: Boolean, default: false },
  },
  computed: {
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
