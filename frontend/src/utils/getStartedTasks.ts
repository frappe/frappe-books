import type { Fyo } from 'fyo';
import type { QueryFilter } from 'utils/db/types';

const TASK_RECORDS: Record<string, [string, QueryFilter?]> = {
  salesItemCreated: ['Item', { for: 'Sales' }],
  purchaseItemCreated: ['Item', { for: 'Purchases' }],
  invoiceCreated: ['SalesInvoice'],
  customerCreated: ['Party', { role: 'Customer' }],
  billCreated: ['PurchaseInvoice'],
  supplierCreated: ['Party', { role: 'Supplier' }],
};

/** Check the open Get Started tasks against the records they ask for. */
export async function getTaskChecks(
  fyo: Fyo
): Promise<Record<string, boolean>> {
  const checks: Record<string, boolean> = {};
  for (const [task, [schemaName, filters]] of Object.entries(TASK_RECORDS)) {
    if (!fyo.singles.GetStarted?.[task]) {
      checks[task] = (await fyo.db.count(schemaName, { filters })) > 0;
    }
  }
  return checks;
}
