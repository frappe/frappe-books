import { DefaultCashDenominations } from 'models/baseModels/Defaults/Defaults';
import { BUTTON_COLOUR_FIELDS } from 'models/baseModels/POSProfile/PosProfile';
import { FrappeDoc } from 'src/frappe/document';

/**
 * Accessory mode's view of Books' POS screen preferences, which stay in
 * Books POS Settings and Books Defaults; the settings' ERPNext tab edits them.
 * Standalone edits those singles in their own tabs.
 */
export class POSScreenSettings extends FrappeDoc {
  // Accessory mode only
  static override doctype = '';
  static override erpnextDoctype = 'Books POS Settings';
  static override presentation = {
    label: 'POS Settings',
    onlyFields: [
      'pos_ui',
      'item_visibility',
      'weight_enabled_barcode',
      'check_digits',
      'item_code_digits',
      'item_weight_digits',
    ],
  };
}

/** The POS screen's button colours and cash denominations, of Books Defaults. */
export class POSScreenDefaults extends FrappeDoc {
  // Accessory mode only
  static override doctype = '';
  static override erpnextDoctype = 'Books Defaults';
  static override presentation = {
    label: 'Defaults',
    onlyFields: [
      'pos_cash_denominations',
      ...Object.keys(BUTTON_COLOUR_FIELDS),
    ],
    fields: BUTTON_COLOUR_FIELDS,
  };
  static override rowModels = {
    pos_cash_denominations: DefaultCashDenominations,
  };
}
