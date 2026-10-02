import { FiltersMap } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
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
    ['save', 'cancel', 'held', 'return', 'pay'].map(
      (action) => [`${action}_button_colour`, { options: BUTTON_COLOURS }]
    )
  );

/** Books Pos Profile, served by Frappe: what a POS counter sells and allows. */
export class POSProfile extends FrappeDoc {
  static override doctype = 'Books Pos Profile';
  static override presentation = {
    label: 'POS Profile',
    nameField: { label: 'Profile' },
    quickEditFields: [
      'name',
      'pos_customer',
      'inventory',
      'pos_print_template',
      'pos_ui',
      'item_visibility',
      'can_change_rate',
      'hide_unavailable_items',
      'can_edit_discount',
      'ignore_pricing_rule',
    ],
    fields: {
      ...withoutCreate(['pos_print_template']),
      ...BUTTON_COLOUR_FIELDS,
    },
  };

  declare pos_customer?: string;
  declare inventory?: string;
  declare pos_print_template?: string;
  declare pos_ui?: 'Classic' | 'Modern';
  declare item_visibility?: string;
  declare can_change_rate?: boolean;
  declare hide_unavailable_items?: boolean;
  declare can_edit_discount?: boolean;
  declare ignore_pricing_rule?: boolean;

  static filters: FiltersMap = {
    pos_print_template: () => [['doc_type', '=', 'Books Sales Invoice']],
  };
}
