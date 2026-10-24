import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc } from 'src/frappe/document';
import type { Presentation } from 'src/frappe/schema';

/** Frappe's Contact, the people and numbers of a customer or supplier. */
export class Contact extends FrappeDoc {
  static override doctype = 'Contact';
  static override presentation: Presentation = {
    label: 'Contact',
    quickEditFields: [
      'first_name',
      'last_name',
      'company_name',
      'email_ids',
      'phone_nos',
    ],
    // Frappe's user, salutation, gender and Google Contacts sync, which Books does not use.
    omitFields: [
      'user',
      'salutation',
      'gender',
      'unsubscribed',
      'sync_with_google_contacts',
      'google_contacts',
      'google_contacts_id',
      'pulled_from_google_contacts',
    ],
  };

  static override getListViewSettings(): ListViewSettings {
    return { columns: ['name', 'email_id', 'mobile_no', 'company_name'] };
  }
}
