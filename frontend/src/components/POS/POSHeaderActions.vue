<template>
  <div class="flex items-center gap-2">
    <POSActionButton
      action="held"
      :profile="profile"
      icon-left="lucide-pause"
      @click="$emit('held')"
    >
      {{ t`Held` }}
    </POSActionButton>
    <POSActionButton
      v-if="enableReturns"
      action="return"
      :profile="profile"
      icon-left="lucide-undo-2"
      @click="$emit('return')"
    >
      {{ t`Return` }}
    </POSActionButton>
    <FrappeButton
      icon-left="lucide-receipt-text"
      :label="t`Sales invoices`"
      @click="$emit('invoices')"
    />
    <FrappeButton
      v-if="fyo.singles.AccountingSettings?.enable_item_enquiry"
      icon-left="lucide-square-pen"
      :label="t`Item enquiry`"
      @click="$emit('enquiry')"
    />
    <FrappeDivider orientation="vertical" class="h-5" />
    <FrappeButton :label="t`Close shift`" @click="$emit('closeShift')" />
  </div>
</template>

<script setup lang="ts">
import { Button as FrappeButton, Divider as FrappeDivider } from 'frappe-ui';
import { t } from 'fyo';
import { POSProfile } from 'models/baseModels/POSProfile/PosProfile';
import { fyo } from 'src/initFyo';
import POSActionButton from './POSActionButton.vue';

defineProps<{ profile?: POSProfile | null; enableReturns?: boolean }>();
defineEmits<{
  held: [];
  return: [];
  invoices: [];
  enquiry: [];
  closeShift: [];
}>();
</script>
