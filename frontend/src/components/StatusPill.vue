<template>
  <Badge v-if="showStatus" :color="badge.color">{{ badge.label }}</Badge>
</template>
<script lang="ts">
import { Doc } from 'fyo/model/doc';
import { LoyaltyProgram } from 'models/baseModels/LoyaltyProgram/LoyaltyProgram';
import { Party } from 'models/baseModels/Party/Party';
import {
  getDocStatus,
  getLoyaltyProgramStatus,
  getLoyaltyProgramStatusText,
  getStatusText,
  loyaltyProgramStatusColor,
  statusColor,
} from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import Badge from 'src/components/Badge.vue';
import { defineComponent } from 'vue';

export default defineComponent({
  components: { Badge },
  props: { doc: { type: Doc, required: true } },
  computed: {
    showStatus(): boolean {
      return !(
        this.doc.schemaName === ModelNameEnum.SalesQuote && this.doc.isSubmitted
      );
    },
    badge(): { color: string; label: string } {
      const status = getDocStatus(this.doc);
      if (status === 'Saved' && this.doc instanceof LoyaltyProgram) {
        const programStatus = getLoyaltyProgramStatus(this.doc);
        return {
          color: loyaltyProgramStatusColor[programStatus] ?? 'gray',
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
          color: 'orange',
          label: this.t`Unpaid ${this.formatAmount(outstanding)}`,
        };
      }

      return {
        color: statusColor[status] ?? 'gray',
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
