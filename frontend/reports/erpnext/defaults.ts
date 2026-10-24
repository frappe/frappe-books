import { DateTime } from 'luxon';
import { getAccessoryCompany } from 'src/frappe/mode';
import { call } from 'src/web/api';
import type { ERPNextFilter } from './types';

/**
 * Tokens for the values ERPNext's report JS works out when it loads. The
 * drift check stubs each call to return its token, so a Books filter and
 * ERPNext's compare equal.
 */
export const DEFAULT = {
  /** `frappe.defaults.get_user_default("Company")`; Books takes the accessory company. */
  company: '@company',
  /** `frappe.datetime.get_today()` */
  today: '@today',
  /** `frappe.datetime.add_months(frappe.datetime.get_today(), -1)` */
  monthAgo: '@month_ago',
  /** `erpnext.utils.get_fiscal_year(frappe.datetime.get_today())` */
  fiscalYear: '@fiscal_year',
  /** `erpnext.utils.get_fiscal_year(frappe.datetime.get_today(), true)[1]` */
  fiscalYearStart: '@fiscal_year_start',
  /** `erpnext.utils.get_fiscal_year(frappe.datetime.get_today(), true)[2]` */
  fiscalYearEnd: '@fiscal_year_end',
  /** `frappe.boot.sysdefaults.disable_include_dimensions ? 0 : 1` */
  includeDimensions: '@include_dimensions',
  /** `frappe.boot.sysdefaults.default_ageing_range` */
  ageingRange: '@ageing_range',
} as const;

/** Tokens for Select and Autocomplete options ERPNext's report JS reads from the boot or the database. */
export const OPTIONS = {
  /** `Object.keys(frappe.boot.party_account_types)` */
  partyTypes: '@party_types',
  /** Party Types whose account type is Receivable */
  receivablePartyTypes: '@receivable_party_types',
  /** Party Types whose account type is Payable */
  payablePartyTypes: '@payable_party_types',
  /** `erpnext.get_presentation_currency_list()` */
  currencies: '@currencies',
} as const;

/** What the default tokens stand for. */
export type DefaultContext = Record<string, unknown>;

interface ERPNextBoot {
  party_account_types?: Record<string, string>;
  docs?: { doctype: string; name: string }[];
  sysdefaults?: {
    disable_include_dimensions?: number;
    default_ageing_range?: string;
  };
}

/** The values of the default tokens: today, the accessory company and its fiscal year. */
export async function getDefaultContext(): Promise<DefaultContext> {
  const today = DateTime.now();
  const company = getAccessoryCompany();
  const { sysdefaults } = getBoot();
  const [fiscalYear, start, end] = await getFiscalYear({
    date: today.toISODate(),
    company,
  });
  return {
    [DEFAULT.company]: company,
    [DEFAULT.today]: today.toISODate(),
    [DEFAULT.monthAgo]: today.minus({ months: 1 }).toISODate(),
    [DEFAULT.fiscalYear]: fiscalYear,
    [DEFAULT.fiscalYearStart]: start,
    [DEFAULT.fiscalYearEnd]: end,
    [DEFAULT.includeDimensions]: sysdefaults?.disable_include_dimensions
      ? 0
      : 1,
    [DEFAULT.ageingRange]: sysdefaults?.default_ageing_range || undefined,
  };
}

/** ERPNext's fiscal year of a date or by name, as [name, start, end]; empty when there is none. */
export async function getFiscalYear(args: {
  date?: string;
  fiscal_year?: string;
  company?: string;
}): Promise<string[]> {
  const year = await call<string[] | false>(
    'erpnext.accounts.utils.get_fiscal_year',
    { ...args, raise_on_missing: false }
  );
  return year || [];
}

/** A filter's default value; ERPNext gives some defaults as a list of one. */
export function resolveDefault(
  filter: ERPNextFilter,
  context: DefaultContext
): unknown {
  const value = Array.isArray(filter.default)
    ? filter.default[0]
    : filter.default;
  return resolveValue(value, context);
}

/** A value, or what its default token stands for. */
export function resolveValue(value: unknown, context: DefaultContext): unknown {
  if (typeof value === 'string' && value.startsWith('@')) {
    return context[value];
  }

  return value;
}

/** The options an option token stands for. */
export function resolveOptions(token: string): string[] {
  const boot = getBoot();
  const partyTypes = boot.party_account_types ?? {};
  const byAccountType = (type: string) =>
    Object.keys(partyTypes).filter((name) => partyTypes[name] === type);
  switch (token) {
    case OPTIONS.partyTypes:
      return Object.keys(partyTypes);
    case OPTIONS.receivablePartyTypes:
      return byAccountType('Receivable');
    case OPTIONS.payablePartyTypes:
      return byAccountType('Payable');
    case OPTIONS.currencies:
      return [
        '',
        ...(boot.docs ?? [])
          .filter(({ doctype }) => doctype === ':Currency')
          .map(({ name }) => name),
      ];
    default:
      return [];
  }
}

function getBoot(): ERPNextBoot {
  return (globalThis.window?.frappe?.boot ?? {}) as ERPNextBoot;
}
