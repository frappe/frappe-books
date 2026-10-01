<template>
  <FrappeDropdown v-if="options.length" :options="options" align="end">
    <FrappeButton
      variant="ghost"
      size="md"
      icon="lucide-plus"
      :label="t`Create`"
    />
  </FrappeDropdown>
</template>
<script setup lang="ts">
import { t } from 'fyo';
import type { RawValueMap } from 'fyo/core/types';
import { Button as FrappeButton, Dropdown as FrappeDropdown } from 'frappe-ui';
import { ModelNameEnum } from 'models/types';
import { fyo } from 'src/initFyo';
import { createFilters } from 'src/utils/filters';
import { openNewDoc } from 'src/utils/ui';

interface CreateOption {
  label: string;
  icon: string;
  schemaName: string;
  initData?: RawValueMap;
}

const options = (
  [
    {
      label: t`Sales Invoice`,
      icon: 'lucide-receipt-text',
      schemaName: ModelNameEnum.SalesInvoice,
    },
    {
      label: t`Receive Payment`,
      icon: 'lucide-hand-coins',
      schemaName: ModelNameEnum.Payment,
      initData: createFilters.SalesPayments,
    },
    {
      label: t`Purchase Invoice`,
      icon: 'lucide-receipt-indian-rupee',
      schemaName: ModelNameEnum.PurchaseInvoice,
    },
    {
      label: t`Make Payment`,
      icon: 'lucide-coins',
      schemaName: ModelNameEnum.Payment,
      initData: createFilters.PurchasePayments,
    },
    {
      label: t`Customer`,
      icon: 'lucide-user-round',
      schemaName: ModelNameEnum.Party,
      initData: createFilters.Customers,
    },
    { label: t`Item`, icon: 'lucide-box', schemaName: ModelNameEnum.Item },
  ] as CreateOption[]
)
  .filter(({ schemaName }) => fyo.can(schemaName, 'create'))
  .map(({ label, icon, schemaName, initData }) => ({
    label,
    icon,
    onClick: () => openNewDoc(schemaName, initData),
  }));
</script>
