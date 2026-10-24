import type { SinglesMap } from 'fyo/model/types';
import { isAccessoryMode } from 'src/frappe/mode';

const INVENTORY_FEATURES = [
  'enable_batches',
  'enable_serial_number',
  'enable_uom_conversions',
  'enable_point_of_sale',
  'show_barcode_field',
] as const;

/** The Books Accounting Settings switches. */
type AccountingFeature =
  | 'enable_discounts_and_margin'
  | 'enable_inventory'
  | 'enable_price_list'
  | 'enable_invoice_returns'
  | 'enable_form_customization'
  | 'enable_lead'
  | 'enable_pricing_rule'
  | 'enable_item_enquiry'
  | 'enable_loyalty_point_program'
  | 'enable_coupon_code'
  | 'enable_item_group';

/** Features ERPNext does not have, which accessory mode turns off. */
const STANDALONE_FEATURES: Feature[] = [
  'enable_item_enquiry',
  'enable_form_customization',
];

/** A Books feature switch, by its settings fieldname. */
export type Feature = (typeof INVENTORY_FEATURES)[number] | AccountingFeature;

/**
 * Whether a feature is on: as the Books settings switch it, or in accessory
 * mode, where those settings are hidden, as ERPNext has it.
 */
export function isFeatureOn(singles: SinglesMap, feature: Feature): boolean {
  if (isAccessoryMode()) {
    return !STANDALONE_FEATURES.includes(feature);
  }

  const settings = (INVENTORY_FEATURES as readonly string[]).includes(feature)
    ? singles.InventorySettings
    : singles.AccountingSettings;
  return !!(settings as Partial<Record<Feature, unknown>> | undefined)?.[
    feature
  ];
}
