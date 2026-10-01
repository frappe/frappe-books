import { FrappeDoc } from 'src/frappe/document';

/** A Books Tax Detail row: an account and rate of a tax template. */
export class TaxDetail extends FrappeDoc {
  static override presentation = { label: 'Tax Detail' };
}
