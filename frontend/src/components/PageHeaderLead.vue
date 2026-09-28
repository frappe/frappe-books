<template>
  <FrappePageHeaderBackButton
    v-if="$route.meta.pushed"
    class="rtl-rotate-180"
    :label="t`Back`"
    fallback-route="/"
  />
  <FrappeButton
    v-else
    variant="ghost"
    size="md"
    icon="lucide-menu"
    :label="t`Menu`"
    @click="openDrawer?.()"
  />
</template>
<script setup lang="ts">
import {
  Button as FrappeButton,
  PageHeaderBackButton as FrappePageHeaderBackButton,
} from 'frappe-ui';
import { openDrawerKey } from 'src/utils/injectionKeys';
import { inject } from 'vue';

/** Phone top bars lead with back on pushed pages and the menu elsewhere. */
const openDrawer = inject(openDrawerKey, undefined);
</script>
