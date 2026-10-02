<template>
	<section
		class="rounded-6 border border-outline-gray-1 bg-surface-gray-1 p-4"
		aria-labelledby="payment-summary-title"
	>
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<h3 id="payment-summary-title" class="text-base-semibold text-ink-gray-9">
					{{ t`Order summary` }}
				</h3>
				<p class="mt-1 truncate text-sm text-ink-gray-6">
					{{ sinvDoc.party || t`No customer selected` }}
				</p>
			</div>
			<FrappeBadge class="shrink-0">
				{{ sinvDoc.isReturn ? t`Return` : t`Sale` }}
			</FrappeBadge>
		</div>

		<dl class="mt-5 space-y-3">
			<div
				v-for="row in detailRows"
				:key="row.label"
				class="flex items-baseline justify-between gap-4"
			>
				<dt class="text-sm text-ink-gray-6">{{ row.label }}</dt>
				<dd class="text-end text-sm tabular-nums text-ink-gray-8">
					{{ formatAmount(row.value) }}
				</dd>
			</div>
		</dl>

		<FrappeDivider class="my-4" flex-item />

		<dl class="space-y-3">
			<div class="flex items-baseline justify-between gap-4">
				<dt class="text-base-medium text-ink-gray-8">{{ t`Grand total` }}</dt>
				<dd class="text-lg-semibold tabular-nums text-ink-gray-9">
					{{ formatAmount(sinvDoc.grand_total) }}
				</dd>
			</div>
			<div class="flex items-baseline justify-between gap-4">
				<dt class="text-sm text-ink-gray-6">{{ t`Outstanding` }}</dt>
				<dd class="text-sm-medium tabular-nums text-ink-gray-8">
					{{ formatAmount(sinvDoc.outstanding_amount) }}
				</dd>
			</div>
		</dl>
	</section>
</template>

<script lang="ts">
import type { SalesInvoice } from "models/invoices/SalesInvoice";
import { Money } from "pesa";
import { fyo } from "src/initFyo";
import { Badge as FrappeBadge, Divider as FrappeDivider } from "frappe-ui";
import { CostLine, getCostLines } from "src/utils/pos";
import { defineComponent, PropType } from "vue";

export default defineComponent({
	name: "PaymentSummary",
	components: { FrappeBadge, FrappeDivider },
	props: {
		sinvDoc: { type: Object as PropType<SalesInvoice>, required: true },
	},
	computed: {
		detailRows(): CostLine[] {
			const rows = getCostLines(this.sinvDoc);
			if (this.hasDistinctBaseTotal) {
				rows.push({
					label: this.fyo.t`Base grand total`,
					value: this.sinvDoc.base_grand_total!,
				});
			}

			return rows;
		},
		hasDistinctBaseTotal(): boolean {
			const baseTotal = this.sinvDoc.base_grand_total;
			const grandTotal = this.sinvDoc.grand_total;
			return Boolean(baseTotal && grandTotal && !baseTotal.eq(grandTotal));
		},
	},
	methods: {
		formatAmount(value: Money | undefined): string {
			return fyo.format(value ?? fyo.pesa(0), "Currency");
		},
	},
});
</script>
