<template>
  <FrappeButton
    v-if="isAccessoryMode()"
    icon="lucide-external-link"
    :label="t`Open in ERPNext`"
    :tooltip="t`Open in ERPNext`"
    @click="openInDesk(getUrl())"
  />
</template>
<script setup lang="ts">
import { Button as FrappeButton } from 'frappe-ui';
import { openInDesk } from 'src/frappe/desk';
import { isAccessoryMode } from 'src/frappe/mode';

/** Accessory mode: opens this page's Desk counterpart; the URL is read on click, with the filters of the moment. */
defineProps<{ getUrl: () => string }>();
</script>
