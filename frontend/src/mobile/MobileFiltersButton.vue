<template>
  <FrappeButton
    v-if="count"
    icon-left="lucide-list-filter"
    :label="t`Filters (${count})`"
  >
    {{ count }}
  </FrappeButton>
  <FrappeButton v-else icon="lucide-list-filter" :label="t`Filters`" />
</template>
<script setup lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { t } from 'fyo';

/** Opens the filters sheet and counts the applied filters. */
defineProps<{ count: number }>();
</script>
