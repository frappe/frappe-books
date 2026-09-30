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
  getDocStatusBadge,
  getLoyaltyProgramBadge,
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
        return getLoyaltyProgramBadge(this.doc);
      }

      // Frappe serves parties, so this is the Frappe fieldname.
      const outstanding = this.doc.outstanding_amount as Money | undefined;
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

      const badge = getDocStatusBadge(this.doc);
      return { ...badge, label: this.getAmountLabel(status) ?? badge.label };
    },
  },
  methods: {
    getAmountLabel(status: string): string | undefined {
      const outstanding = this.doc.outstandingAmount as Money | undefined;
      const grandTotal = this.doc.grandTotal as Money | undefined;
      if (status === 'Unpaid' && outstanding) {
        return this.t`Unpaid ${this.formatAmount(outstanding)}`;
      }

      if (status === 'Partly Paid' && outstanding && grandTotal) {
        return this
          .t`Partly Paid ${this.formatAmount(grandTotal.sub(outstanding))}`;
      }

      return undefined;
    },
    formatAmount(amount: Money): string {
      return this.fyo.format(amount, 'Currency');
    },
  },
});
</script>
