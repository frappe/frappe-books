<template>
  <div class="grid grid-cols-[1fr_2fr] gap-2">
    <POSActionButton
      v-if="!isSubmitted"
      action="save"
      :profile="profile"
      size="lg"
      @click="$emit('save')"
    >
      {{ t`Hold` }}
    </POSActionButton>
    <POSActionButton
      action="pay"
      :profile="profile"
      size="lg"
      variant="solid"
      :class="{ 'col-span-full': isSubmitted }"
      :disabled="disablePay"
      @click="$emit('pay')"
    >
      {{ payLabel }}
    </POSActionButton>
  </div>
</template>

<script setup lang="ts">
import { t } from 'fyo';
import { POSProfile } from 'models/baseModels/POSProfile/PosProfile';
import { Money } from 'pesa';
import { fyo } from 'src/initFyo';
import { computed } from 'vue';
import POSActionButton from './POSActionButton.vue';

const props = defineProps<{
  profile?: POSProfile | null;
  disablePay?: boolean;
  isReturn?: boolean;
  isSubmitted?: boolean;
  grandTotal?: Money;
}>();
defineEmits<{ save: []; pay: [] }>();

const payLabel = computed(() => {
  const amount = fyo.format(props.grandTotal ?? fyo.pesa(0), 'Currency');
  return props.isReturn ? t`Refund ${amount}` : t`Pay ${amount}`;
});
</script>
