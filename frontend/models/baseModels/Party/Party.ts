import { Fyo } from 'fyo';
import { Doc } from 'fyo/model/doc';
import {
  Action,
  ChangeArg,
  FiltersMap,
  HiddenMap,
  ListViewSettings,
  ValidationMap,
} from 'fyo/model/types';
import {
  validateFrappeEmail,
  validateFrappePhone,
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
  };

  role?: PartyRole;
  from_lead?: string;

  override async change(change: ChangeArg) {
    await super.change(change);
    if (change.changed === 'role') {
      // The server sets the new role's default account on save.
      this.default_account = undefined;
    }
  }

  // Frappe checks these on save; mirrored to show its message at the field.
  validations: ValidationMap = {
    email: validateFrappeEmail,
    phone: validateFrappePhone,
  };

  // GST fields are Indian; see the Indian Party.
  hidden: HiddenMap = {
    gst_type: () => true,
    gstin: () => true,
  };

  // Accounts are still read through the bridge, so these use its field names.
  static filters: FiltersMap = {
    default_account: (doc: Doc) => {
      const role = doc.role as PartyRole;
      if (role === 'Both') {
        return {
          isGroup: false,
          accountType: ['in', ['Payable', 'Receivable']],
        };
      }

      return {
        isGroup: false,
        accountType: role === 'Customer' ? 'Receivable' : 'Payable',
      };
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
        condition: (doc: Doc) =>
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
        condition: (doc: Doc) =>
          !doc.notInserted && (doc.role as PartyRole) !== 'Customer',
        action: async (partyDoc, router) => {
          await router.push({
            path: '/list/PurchaseInvoice',
            query: { filters: JSON.stringify({ party: partyDoc.name }) },
          });
        },
      },
      {
        label: fyo.t`Create Sale`,
        condition: (doc: Doc) =>
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
        condition: (doc: Doc) =>
          !doc.notInserted && (doc.role as PartyRole) !== 'Supplier',
        action: async (partyDoc, router) => {
          await router.push({
            path: '/list/SalesInvoice',
            query: { filters: JSON.stringify({ party: partyDoc.name }) },
          });
        },
      },
    ];
  }
}
