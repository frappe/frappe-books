import { Doc } from 'fyo/model/doc';
import { FiltersMap } from 'fyo/model/types';

export class POSProfile extends Doc {
  posProfile?: string;
  posCustomer?: string;
  defaultLocation?: string;
  posPrintTemplate?: string;
  inventory?: string;
  posUI?: 'Classic' | 'Modern';
  itemVisibility?: string;
  canChangeRate?: boolean;
  hideUnavailableItems?: boolean;
  canEditDiscount?: boolean;
  ignorePricingRule?: boolean;

  static filters: FiltersMap = {
    // Print Formats are Frappe-backed, so they filter by Frappe fieldnames.
    posPrintTemplate: () => ({ doc_type: 'Books Sales Invoice' }),
  };
}
