import { FrappeDoc } from 'src/frappe/document';

/** Books ERPNext Settings, served by Frappe: the default company and the accessory mode switch. System Managers only. */
export class ERPNextSettings extends FrappeDoc {
  static override doctype = 'Books ERPNext Settings';
  // The switch itself, in both modes
  static override erpnextDoctype = 'Books ERPNext Settings';
  static override presentation = { label: 'ERPNext' };

  declare default_company?: string;
  declare accessory_mode?: boolean;
}
