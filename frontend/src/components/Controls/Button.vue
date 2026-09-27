<template>
  <div class="mt-6 w-full">
    <FrappeButton
      class="w-full"
      theme="gray"
      variant="solid"
      size="md"
      :disabled="isReadOnly"
      @click="onClick"
    >
      {{ df.label }}
    </FrappeButton>
  </div>
</template>

<script lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { defineComponent } from 'vue';
import Base from './Base.vue';

export default defineComponent({
  name: 'Button',
  components: { FrappeButton },
  extends: Base,
  props: {
    spaceBetween: {
      type: Boolean,
      default: true,
    },
    labelRight: {
      type: Boolean,
      default: false,
    },
    labelClass: {
      type: String,
      default: '',
    },
    showLabel: {
      type: Boolean,
      default: true,
    },
  },
  methods: {
    onClick() {
      if (this.isReadOnly) return;
      this.triggerChange(true);
    },
  },
});
</script>
