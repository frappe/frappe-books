<template>
  <div
    class="
      px-3 sm:px-5
      text-xl
      font-semibold
      flex
      justify-between
      h-14
      items-center
      flex-shrink-0
    "
  >
    <h1 v-if="formTitle" class="text-ink-gray-8">{{ formTitle }}</h1>
    <slot />
    <p v-if="formSubTitle" class="text-ink-gray-6">
      {{ formSubTitle }}
    </p>
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  props: {
    formTitle: { type: String, default: '' },
    formSubTitle: { type: String, default: '' },
  },
});
</script>
