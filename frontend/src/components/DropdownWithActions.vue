<template>
  <FrappeDropdown
    v-if="actions.length"
    :options="options"
    :disabled="disabled"
    align="end"
  >
    <template #trigger>
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
  </FrappeDropdown>
</template>

<script lang="ts">
import {
  Button as FrappeButton,
  Dropdown as FrappeDropdown,
  type DropdownOption,
  type DropdownOptions,
} from 'frappe-ui';
import { FrappeDoc } from 'src/frappe/document';
import { Action } from 'fyo/model/types';
import { defineComponent, PropType } from 'vue';

export default defineComponent({
  name: 'DropdownWithActions',
  components: { FrappeButton, FrappeDropdown },
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
    doc(): FrappeDoc | undefined {
      const doc = this.injectedDoc;
      return doc instanceof FrappeDoc ? doc : undefined;
    },
    options(): DropdownOptions {
      const groups = new Map<string, Action[]>();
      for (const action of this.actions) {
        const group = action.group ?? '';
        groups.set(group, [...(groups.get(group) ?? []), action]);
      }

      const options: DropdownOptions = (groups.get('') ?? []).map(
        this.toOption
      );
      for (const group of [...groups.keys()].filter(Boolean).sort()) {
        options.push({ group, options: groups.get(group)!.map(this.toOption) });
      }

      return options;
    },
  },
  methods: {
    toOption(action: Action): DropdownOption {
      return {
        label: action.label,
        theme: action.theme,
        onClick: () => this.runAction(action),
      };
    },
    async runAction({ action }: Action) {
      // Actions shown without a document, such as report exports, take no arguments.
      if (this.doc) {
        await action(this.doc, this.$router);
      } else {
        await (action as () => unknown)();
      }
    },
  },
});
</script>
