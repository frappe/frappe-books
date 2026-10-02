import { ModelNameEnum } from 'models/types';
import type { Filter } from 'src/frappe/api';

export const routeFilters = {
  SalesItems: [['item_usage', 'in', ['Sales', 'Both']]],
  PurchaseItems: [['item_usage', 'in', ['Purchases', 'Both']]],
  Items: [['item_usage', '=', 'Both']],
  PurchasePayments: [['reference_type', '=', ModelNameEnum.PurchaseInvoice]],
  SalesPayments: [['reference_type', '=', ModelNameEnum.SalesInvoice]],
  Suppliers: [['role', 'in', ['Supplier', 'Both']]],
  Customers: [['role', 'in', ['Customer', 'Both']]],
} satisfies Record<string, Filter[]>;

export const createFilters = {
  SalesItems: { item_usage: 'Sales' },
  PurchaseItems: { item_usage: 'Purchases' },
  Items: { item_usage: 'Both' },
  PurchasePayments: { payment_type: 'Pay' },
  SalesPayments: { payment_type: 'Receive' },
  Suppliers: { role: 'Supplier' },
  Customers: { role: 'Customer' },
  Party: { role: 'Both' },
};
