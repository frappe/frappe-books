import { FiltersMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
import { toActiveDoctype } from 'src/frappe/mode';
import { FieldPresentation, withoutCreate } from 'src/frappe/schema';

const BUTTON_COLOURS = [
  { label: 'Red', value: '#f98080' },
  { label: 'Orange', value: '#fbbf70' },
  { label: 'Yellow', value: '#fde047' },
  { label: 'Green', value: '#86efac' },
  { label: 'Teal', value: '#5eead4' },
  { label: 'Blue', value: '#60a5fa' },
  { label: 'Indigo', value: '#818cf8' },
  { label: 'Purple', value: '#a78bfa' },
  { label: 'Pink', value: '#f472b6' },
  { label: 'Black', value: '#9ca3af' },
];

/** The POS button colour fields, by fieldname, with the colours they offer. */
export const BUTTON_COLOUR_FIELDS: Record<string, FieldPresentation> =
  Object.fromEntries(
    ['save', 'cancel', 'held', 'return', 'pay'].map((action) => [
      `${action}_button_colour`,
      { options: BUTTON_COLOURS },
    ])
  );

/** Books POS Profile, served by Frappe: what a POS counter sells and allows. */
export class POSProfile extends FrappeDoc {
  static override doctype = 'Books POS Profile';
  static override presentation = {
    label: 'POS Profile',
    nameField: { label: 'Profile' },
    quickEditFields: [
      'name',
      'customer',
      'warehouse',
      'print_format',
      'item_visibility',
      'allow_rate_change',
      'hide_unavailable_items',
      'allow_discount_change',
      'ignore_pricing_rule',
    ],
    fields: {
      ...withoutCreate(['print_format']),
      ...BUTTON_COLOUR_FIELDS,
    },
  };

  declare customer?: string;
  declare warehouse?: string;
  declare print_format?: string;
  declare item_visibility?: string;
  declare allow_rate_change?: boolean;
  declare hide_unavailable_items?: boolean;
  declare allow_discount_change?: boolean;
  declare ignore_pricing_rule?: boolean;
  // ERPNext POS Profile only
  declare item_groups?: (FrappeDoc & { item_group?: string })[];
  declare payments?: (FrappeDoc & { mode_of_payment?: string })[];

  static filters: FiltersMap = {
    print_format: () => [
      ['doc_type', '=', toActiveDoctype('Books Sales Invoice')],
    ],
  };
}
