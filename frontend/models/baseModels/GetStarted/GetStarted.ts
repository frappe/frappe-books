import { FrappeDoc } from 'src/frappe/document';

/** Books Get Started, served by Frappe. The server works out the record tasks. */
export class GetStarted extends FrappeDoc {
  static override doctype = 'Books Get Started';
  static override presentation = { label: 'Get Started' };

  declare onboarding_complete?: boolean;
  declare tasks_complete?: boolean;
}
