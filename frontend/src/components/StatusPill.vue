<template>
  <FrappeBadge v-if="showStatus" :theme="badgeTheme" variant="subtle">
    {{ text }}
  </FrappeBadge>
</template>
<script lang="ts">
import { Doc } from 'fyo/model/doc';
import { isPesa } from 'fyo/utils';
import { Badge as FrappeBadge } from 'frappe-ui';
import { Invoice } from 'models/baseModels/Invoice/Invoice';
import { Party } from 'models/baseModels/Party/Party';
import { LoyaltyProgram } from 'models/baseModels/LoyaltyProgram/LoyaltyProgram';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { defineComponent } from 'vue';

type Status = ReturnType<typeof getStatus>;
type UIColors = 'gray' | 'orange' | 'red' | 'green' | 'blue' | 'yellow';

export default defineComponent({
  components: { FrappeBadge },
  props: { doc: { type: Doc, required: true } },
  computed: {
    showStatus(): boolean {
      return !(
        this.doc.schemaName === ModelNameEnum.SalesQuote && this.doc.isSubmitted
      );
    },
    badgeTheme(): 'gray' | 'blue' | 'green' | 'amber' | 'red' {
      return {
        gray: 'gray',
        orange: 'amber',
        red: 'red',
        green: 'green',
        blue: 'blue',
        yellow: 'amber',
      }[this.color] as 'gray' | 'blue' | 'green' | 'amber' | 'red';
    },
    status(): Status {
      return getStatus(this.doc);
    },
    text() {
      const hasOutstanding = isPesa(this.doc.outstandingAmount);

      if (hasOutstanding && this.status === 'Unpaid') {
        const amt = this.fyo.format(this.doc.outstandingAmount, 'Currency');
        return this.t`Unpaid ${amt}`;
      }

      if (hasOutstanding && this.status === 'PartlyPaid') {
        const outstandingPayment = this.fyo.format(
          (this.doc.grandTotal as Money).sub(
            this.doc.outstandingAmount as Money
          ),
          'Currency'
        );
        return this.t`Partly Paid ${outstandingPayment}`;
      }

      if (this.status === 'Outstanding') {
        const outstandingPayment = this.fyo.format(
          this.doc.outstandingAmount as Money,
          'Currency'
        );
        return this.t`Unpaid ${outstandingPayment}`;
      }

      return {
        Draft: this.t`Draft`,
        Cancelled: this.t`Cancelled`,
        Outstanding: this.t`Outstanding`,
        NotTransferred: this.t`Not Transferred`,
        NotSaved: this.t`Not Saved`,
        NotSubmitted: this.t`Not Submitted`,
        Paid: this.t`Paid`,
        Saved: this.t`Saved`,
        Submitted: this.t`Submitted`,
        Return: this.t`Return`,
        ReturnIssued: this.t`Return Issued`,
        Unpaid: this.t`Unpaid`,
        PartlyPaid: this.t`Partly Paid`,
        Expired: this.t`Expired`,
        Active: this.t`Active`,
        Maxed: this.t`Maxed`,
      }[this.status];
    },
    color(): UIColors {
      return statusColorMap[this.status];
    },
  },
});

const statusColorMap: Record<Status, UIColors> = {
  Draft: 'gray',
  Cancelled: 'red',
  Outstanding: 'orange',
  NotTransferred: 'orange',
  NotSaved: 'orange',
  NotSubmitted: 'orange',
  Paid: 'green',
  Saved: 'blue',
  Submitted: 'blue',
  Return: 'gray',
  ReturnIssued: 'gray',
  Unpaid: 'red',
  PartlyPaid: 'yellow',
  Expired: 'red',
  Active: 'green',
  Maxed: 'orange',
};

function getStatus(doc: Doc) {
  if (doc.notInserted) {
    return 'Draft';
  }

  if (doc.dirty) {
    return 'NotSaved';
  }

  if (doc instanceof LoyaltyProgram) {
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    const maximumUse = doc.maximumUse as number;
    const used = doc.used as number;

    if (maximumUse > 0 && used >= maximumUse) {
      return 'Maxed';
    }

    if (doc.toDate && doc.toDate instanceof Date) {
      const toDate = new Date(doc.toDate);
      toDate.setHours(0, 0, 0, 0);
      if (toDate <= currentDate) {
        return 'Expired';
      }
    }
    return 'Active';
  }

  if (doc instanceof Party && doc.outstandingAmount?.isZero() !== true) {
    return 'Outstanding';
  }

  if (doc.schema.isSubmittable) {
    return getSubmittableStatus(doc);
  }

  return 'Saved';
}

function getSubmittableStatus(doc: Doc) {
  if (doc.isCancelled) {
    return 'Cancelled';
  }

  if (doc.returnAgainst && doc.isSubmitted) {
    return 'Return';
  }

  if (doc.isReturned && doc.isSubmitted) {
    return 'ReturnIssued';
  }

  const isInvoice = doc instanceof Invoice;

  if (doc.isSubmitted && isInvoice && (doc.stockNotTransferred ?? 0) > 0) {
    return 'NotTransferred';
  }

  if (
    doc.isSubmitted &&
    isInvoice &&
    doc.outstandingAmount?.isZero() === true
  ) {
    return 'Paid';
  }

  if (
    doc.isSubmitted &&
    isInvoice &&
    !doc.isCancelled &&
    (doc.outstandingAmount as Money)?.isPositive() &&
    (doc.outstandingAmount as Money)?.neq(doc.baseGrandTotal as Money)
  ) {
    return 'PartlyPaid';
  }

  if (
    doc.isSubmitted &&
    isInvoice &&
    !doc.isCancelled &&
    (doc.outstandingAmount as Money)?.eq(doc.baseGrandTotal as Money)
  ) {
    return 'Unpaid';
  }

  if (
    doc.isSubmitted &&
    isInvoice &&
    doc.outstandingAmount?.isZero() !== true
  ) {
    return 'Outstanding';
  }

  if (doc.isSubmitted) {
    return 'Submitted';
  }

  return 'NotSubmitted';
}
</script>
