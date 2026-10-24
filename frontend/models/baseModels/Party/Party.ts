import { Fyo } from 'fyo';
import { Action, ListViewSettings, ValidationMap } from 'fyo/model/types';
import { canOpenLedger, getMappedDocAction } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { FrappeDoc } from 'src/frappe/document';
import type { Presentation } from 'src/frappe/schema';
import { getModel } from 'src/frappe/registry';
import {
  validateEmail,
  validatePhoneNumber,
} from 'src/frappe/validation';
import { PartyAccount } from './PartyAccount';

/**
 * What a customer and a supplier share, served by Frappe. The server fills
 * the default account and currency on save.
 */
export abstract class Party extends FrappeDoc {
  /** The account type of the default accounts. */
  static accountType: 'Receivable' | 'Payable';
  static override rowModels = { accounts: PartyAccount };

  // Frappe checks these on save; mirrored to show its message at the field.
  validations: ValidationMap = {
    email: validateEmail,
    phone: validatePhoneNumber,
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'email', 'phone', 'outstanding_amount'],
    };
  }
}

/** A customer's or supplier's presentation; GST fields are Indian. */
export function getPartyPresentation(
  label: string,
  quickEditFields: string[]
): Presentation {
  return {
    label,
    quickEditFields,
    omitFields: ['gst_category', 'gstin'],
  };
}

interface PartyInvoice {
  schemaName: ModelNameEnum.SalesInvoice | ModelNameEnum.PurchaseInvoice;
  mapper: string;
  createLabel: string;
  viewLabel: string;
}

/** Make an invoice for the party, list its invoices, and open its ledger. */
export function getPartyActions(
  fyo: Fyo,
  { schemaName, mapper, createLabel, viewLabel }: PartyInvoice
): Action[] {
  return [
    getMappedDocAction(fyo, {
      label: createLabel,
      condition: (doc: FrappeDoc) => !doc.notInserted,
      target: () => [schemaName, mapper],
    }),
    {
      label: viewLabel,
      condition: (doc: FrappeDoc) =>
        !doc.notInserted && fyo.can(schemaName, 'read'),
      action: async (partyDoc, router) => {
        const partyField = getModel(schemaName)!.partyField!;
        await router.push({
          path: `/list/${schemaName}`,
          query: {
            filters: JSON.stringify([[partyField, '=', partyDoc.name]]),
          },
        });
      },
    },
    getGeneralLedgerAction(fyo),
  ];
}

function getGeneralLedgerAction(fyo: Fyo): Action {
  return {
    label: fyo.t`General Ledger`,
    group: fyo.t`View`,
    condition: (doc: FrappeDoc) =>
      doc.inserted && canOpenLedger('GeneralLedger'),
    action: async (partyDoc, router) => {
      // The party type first: a new party type clears the party.
      const filters = {
        partyType: (partyDoc.constructor as typeof Party).doctype,
        party: partyDoc.name,
      };
      await router.push({
        path: '/report/GeneralLedger',
        query: { defaultFilters: JSON.stringify(filters) },
      });
    },
  };
}
