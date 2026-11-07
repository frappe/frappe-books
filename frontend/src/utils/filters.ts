import type { Filter } from 'src/frappe/api';

// An internal transfer has no party, so both payment lists show it.
export const routeFilters = {
  PurchasePayments: [['party_type', 'in', ['Books Supplier', '']]],
  SalesPayments: [['party_type', 'in', ['Books Customer', '']]],
} satisfies Record<string, Filter[]>;

export const createFilters = {
  PurchasePayments: { payment_type: 'Pay' },
  SalesPayments: { payment_type: 'Receive' },
};
