import { Fyo } from 'fyo';
import {
  Action,
  FiltersMap,
  HiddenMap,
  ListViewSettings,
  ValidationMap,
} from 'fyo/model/types';
import {
  validateEmail,
  validatePhoneNumber,
} from 'fyo/model/validationFunction';
import { getMappedDoc } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { FrappeDoc } from 'src/frappe/document';
import { getFrappeDoc } from 'src/frappe/documents';
import { PartyRole } from './types';

/**
 * Books Party, a customer or supplier, served by Frappe. The server fills
 * its default account and currency on save, and marks its lead converted.
 */
export class Party extends FrappeDoc {
  static override doctype = 'Books Party';
  static override presentation = {
    label: 'Party',
    nameField: { label: 'Name', placeholder: 'Full Name' },
    quickEditFields: [
      'email',
      'phone',
      'address',
      'default_account',
      'loyalty_program',
      'currency',
      'role',
      'tax_id',
    ],
    fields: { from_lead: { create: false } },
    // GST fields are Indian; see the Indian Party.
    omitFields: ['gst_type', 'gstin'],
    // Not phone, a search field only so that POS finds customers by it.
    paletteFields: ['email', 'role'],
  };
  // The server sets the new role's default account on save.
  static override refills = { role: ['default_account'] };

  role?: PartyRole;
  from_lead?: string;
  declare loyalty_program?: string;

  // Frappe checks these on save; mirrored to show its message at the field.
  validations: ValidationMap = {
    email: validateEmail,
    phone: validatePhoneNumber,
  };

  // Loyalty is for customers, while the program is on.
  hidden: HiddenMap = {
    loyalty_program: () =>
      !this.fyo.singles.AccountingSettings?.enable_loyalty_program ||
      this.role === 'Supplier',
    loyalty_points: () => !this.loyalty_program || this.role === 'Supplier',
  };

  static filters: FiltersMap = {
    default_account: (doc: FrappeDoc) => {
      const role = doc.role as PartyRole;
      if (role === 'Both') {
        return [
          ['is_group', '=', 0],
          ['account_type', 'in', ['Payable', 'Receivable']],
        ];
      }

      return [
        ['is_group', '=', 0],
        ['account_type', '=', role === 'Customer' ? 'Receivable' : 'Payable'],
      ];
    },
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'email', 'phone', 'outstanding_amount'],
    };
  }

  async afterDelete() {
    await super.afterDelete();
    await this.reloadLead();
  }

  async afterSync() {
    await this.reloadLead();
  }

  /** Shows the lead status the server set when this party was saved or deleted. */
  async reloadLead() {
    if (this.from_lead) {
      await getFrappeDoc(ModelNameEnum.Lead, this.from_lead, { refresh: true });
    }
  }

  static getActions(fyo: Fyo): Action[] {
    return [
      {
        label: fyo.t`Create Purchase`,
        condition: (doc: FrappeDoc) =>
          !doc.notInserted && (doc.role as PartyRole) !== 'Customer',
        action: async (partyDoc, router) => {
          const doc = await getMappedDoc(
            partyDoc,
            ModelNameEnum.PurchaseInvoice,
            'make_purchase_invoice'
          );

          await router.push({
            path: `/edit/PurchaseInvoice/${doc.name!}`,
            query: {
              schemaName: 'PurchaseInvoice',
              values: {
                // @ts-expect-error the router types query values as strings
                party: partyDoc.name!,
              },
            },
          });
        },
      },
      {
        label: fyo.t`View Purchases`,
        condition: (doc: FrappeDoc) =>
          !doc.notInserted && (doc.role as PartyRole) !== 'Customer',
        action: async (partyDoc, router) => {
          await router.push({
            path: '/list/PurchaseInvoice',
            query: { filters: JSON.stringify([['party', '=', partyDoc.name]]) },
          });
        },
      },
      {
        label: fyo.t`Create Sale`,
        condition: (doc: FrappeDoc) =>
          !doc.notInserted && (doc.role as PartyRole) !== 'Supplier',
        action: async (partyDoc, router) => {
          const doc = await getMappedDoc(
            partyDoc,
            ModelNameEnum.SalesInvoice,
            'make_sales_invoice'
          );

          await router.push({
            path: `/edit/SalesInvoice/${doc.name!}`,
            query: {
              schemaName: 'SalesInvoice',
              values: {
                // @ts-expect-error the router types query values as strings
                party: partyDoc.name!,
              },
            },
          });
        },
      },
      {
        label: fyo.t`View Sales`,
        condition: (doc: FrappeDoc) =>
          !doc.notInserted && (doc.role as PartyRole) !== 'Supplier',
        action: async (partyDoc, router) => {
          await router.push({
            path: '/list/SalesInvoice',
            query: { filters: JSON.stringify([['party', '=', partyDoc.name]]) },
          });
        },
      },
    ];
  }
}
