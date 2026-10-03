import { getPOSBatchQuantity } from 'models/inventory/posStock';
import type { SalesInvoiceItem } from 'models/invoices/InvoiceItem';
import { ref, watch, type Ref } from 'vue';

/**
 * Stock of the row's batch at the POS location. A POS row gets its batch
 * before its item, so it is read again as either changes.
 */
export function usePOSBatchQuantity(
  getRow: () => SalesInvoiceItem | null
): Ref<number> {
  const quantity = ref(0);
  watch(
    [() => getRow()?.item, () => getRow()?.batch],
    async ([item, batch]) => {
      quantity.value = await getPOSBatchQuantity(item, batch);
    },
    { immediate: true }
  );
  return quantity;
}
