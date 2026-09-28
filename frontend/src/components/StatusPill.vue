<template>
  <FrappeBadge v-if="showStatus" :theme="badge.theme">{{
    badge.label
  }}</FrappeBadge>
</template>
<script lang="ts">
import { Badge as FrappeBadge } from 'frappe-ui';
import { Doc } from 'fyo/model/doc';
import { BadgeData } from 'fyo/model/types';
import { LoyaltyProgram } from 'models/baseModels/LoyaltyProgram/LoyaltyProgram';
import { Party } from 'models/baseModels/Party/Party';
import {
  getDocStatus,
  getLoyaltyProgramStatusText,
  getStatusText,
  loyaltyProgramStatusColor,
  statusColor,
} from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { defineComponent } from 'vue';

export default defineComponent({
  components: { FrappeBadge },
  props: { doc: { type: Doc, required: true } },
  computed: {
    showStatus(): boolean {
      return !(
        this.doc.schemaName === ModelNameEnum.SalesQuote && this.doc.isSubmitted
      );
    },
    badge(): BadgeData {
      const status = getDocStatus(this.doc);
      if (status === 'Saved' && this.doc instanceof LoyaltyProgram) {
        const programStatus = this.doc.status as string;
        return {
          theme: loyaltyProgramStatusColor[programStatus] ?? 'gray',
          label: getLoyaltyProgramStatusText(programStatus),
        };
      }

      const outstanding = this.doc.outstandingAmount as Money | undefined;
      if (
        status === 'Saved' &&
        this.doc instanceof Party &&
        outstanding &&
        !outstanding.isZero()
      ) {
        return {
          theme: 'amber',
          label: this.t`Unpaid ${this.formatAmount(outstanding)}`,
        };
      }

      return {
        theme: statusColor[status] ?? 'gray',
        label: this.getLabel(status),
      };
    },
  },
  methods: {
    getLabel(status: ReturnType<typeof getDocStatus>): string {
      const outstanding = this.doc.outstandingAmount as Money | undefined;
      const grandTotal = this.doc.grandTotal as Money | undefined;
      if (status === 'Unpaid' && outstanding) {
        return this.t`Unpaid ${this.formatAmount(outstanding)}`;
      }

      if (status === 'PartlyPaid' && outstanding && grandTotal) {
        return this
          .t`Partly Paid ${this.formatAmount(grandTotal.sub(outstanding))}`;
      }

      return getStatusText(status);
    },
    formatAmount(amount: Money): string {
      return this.fyo.format(amount, 'Currency');
    },
  },
});
</script>
