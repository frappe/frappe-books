import { ListViewSettings } from 'fyo/model/types';
import { FrappeDoc, type LinkCard } from 'src/frappe/document';
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

  // A party's primary contact shows by name, email and mobile.
  static override linkCard: LinkCard = {
    fields: ['full_name', 'email_id', 'mobile_no'],
    getContent: ({ name, full_name, email_id, mobile_no }) => ({
      title: String(full_name || name),
      lines: [
        { icon: 'lucide-mail', text: email_id as string },
        { icon: 'lucide-smartphone', text: mobile_no as string },
      ].filter(({ text }) => text),
    }),
  };

  static override getListViewSettings(): ListViewSettings {
    return { columns: ['name', 'email_id', 'mobile_no', 'company_name'] };
  }
}
