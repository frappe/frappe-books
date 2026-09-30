import { FrappeDoc } from 'src/frappe/document';

/** Books Misc, served by Frappe: the user's form preferences. */
export class Misc extends FrappeDoc {
  static override doctype = 'Books Misc';
  static override presentation = { label: 'Misc' };

  declare use_full_width?: boolean;
}
