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
    icon="lucide-panel-left"
    :label="t`Menu`"
    @click="openNavSheet?.()"
  />
</template>
<script setup lang="ts">
import {
  Button as FrappeButton,
  PageHeaderBackButton as FrappePageHeaderBackButton,
} from 'frappe-ui';
import { openNavSheetKey } from 'src/utils/injectionKeys';
import { inject } from 'vue';

/**
 * Phone top bars lead with back on pushed pages and the nav sheet elsewhere.
 * The back chevron is flipped for RTL by hand (frappe/frappe-ui#1220).
 */
const openNavSheet = inject(openNavSheetKey, undefined);
</script>
