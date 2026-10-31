import type { Filter } from 'src/frappe/api';

export const routeFilters = {
  PurchasePayments: [['party_type', '=', 'Books Supplier']],
  SalesPayments: [['party_type', '=', 'Books Customer']],
} satisfies Record<string, Filter[]>;

export const createFilters = {
  PurchasePayments: { payment_type: 'Pay' },
  SalesPayments: { payment_type: 'Receive' },
};
