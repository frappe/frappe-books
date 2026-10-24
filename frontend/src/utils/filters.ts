import { toActiveDoctype } from 'src/frappe/mode';
import type { Filter } from 'src/frappe/api';

export const routeFilters = {
  PurchasePayments: [['party_type', '=', toActiveDoctype('Books Supplier')]],
  SalesPayments: [['party_type', '=', toActiveDoctype('Books Customer')]],
} satisfies Record<string, Filter[]>;

export const createFilters = {
  PurchasePayments: { payment_type: 'Pay' },
  SalesPayments: { payment_type: 'Receive' },
};
