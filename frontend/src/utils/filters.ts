import { ModelNameEnum } from 'models/types';

// Items are Frappe-backed, so their filters use Frappe fieldnames.
export const routeFilters = {
  SalesItems: { item_usage: ['in', ['Sales', 'Both']] },
  PurchaseItems: { item_usage: ['in', ['Purchases', 'Both']] },
  Items: { item_usage: 'Both' },
  PurchasePayments: {
    referenceType: ModelNameEnum.PurchaseInvoice,
  },
  SalesPayments: {
    referenceType: ModelNameEnum.SalesInvoice,
  },
  Suppliers: { role: ['in', ['Supplier', 'Both']] },
  Customers: { role: ['in', ['Customer', 'Both']] },
  Party: { role: 'Both' },
};

export const createFilters = {
  SalesItems: { item_usage: 'Sales' },
  PurchaseItems: { item_usage: 'Purchases' },
  Items: { item_usage: 'Both' },
  PurchasePayments: { paymentType: 'Pay' },
  SalesPayments: { paymentType: 'Receive' },
  Suppliers: { role: 'Supplier' },
  Customers: { role: 'Customer' },
  Party: { role: 'Both' },
};
