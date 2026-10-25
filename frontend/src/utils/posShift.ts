import {
  CashCountRow,
  POSOpeningEntry,
} from 'models/inventory/Point of Sale/POSOpeningEntry';
import { ModelNameEnum, ModeOfPaymentType } from 'models/types';
import type { Money } from 'pesa';
import { getAllDocuments, getList } from 'src/frappe/api';
import { getDocType } from 'src/frappe/doctypes';
import { getFrappeDoc } from 'src/frappe/documents';
import {
  getAccessoryCompany,
  isAccessoryMode,
  toActiveDoctype,
} from 'src/frappe/mode';
import { fyo } from 'src/initFyo';
import { call } from 'src/web/api';
import { computed, markRaw, reactive, shallowRef } from 'vue';

const GET_OPEN_SHIFT =
  'frappe_books.frappe_books.doctype.books_pos_opening_entry.books_pos_opening_entry.get_open_shift';
const CHECK_OPENING_ENTRY =
  'erpnext.selling.page.point_of_sale.point_of_sale.check_opening_entry';
const POS_PROFILE_QUERY =
  'erpnext.accounts.doctype.pos_profile.pos_profile.pos_profile_query';

/**
 * The open POS shift and the payment methods it counts, as of the last
 * `refresh`. Cash methods are those of the Cash type, as on the server: the
 * counted drawer covers them all. In accessory mode the shift is an ERPNext
 * POS Opening Entry of one of the POS Profiles assigned to the user.
 */
export function usePOSShift() {
  const openShift = shallowRef<POSOpeningEntry>();
  const methodTypes = shallowRef<Record<string, ModeOfPaymentType>>({});
  const profiles = shallowRef<string[]>([]);
  const isLoaded = shallowRef(false);

  async function refresh() {
    const [name, methods, assigned] = await Promise.all([
      getOpenShiftName(),
      getAllDocuments(toActiveDoctype('Books Mode of Payment'), {
        fields: ['name', 'type'],
      }),
      getAssignedProfiles(),
    ]);
    openShift.value = name
      ? ((await getFrappeDoc(
          ModelNameEnum.POSOpeningEntry,
          name
        )) as POSOpeningEntry)
      : undefined;
    methodTypes.value = Object.fromEntries(
      methods.map(({ name, type }) => [name, type as ModeOfPaymentType])
    );
    profiles.value = assigned;
    isLoaded.value = true;
  }

  return reactive({
    openShift: computed(() => openShift.value),
    isLoaded: computed(() => isLoaded.value),
    isOpen: computed(() => !!openShift.value),
    openedAt: computed(() => openShift.value?.period_start_date),
    methodTypes: computed(() => methodTypes.value),
    cashMethods: computed(() =>
      Object.keys(methodTypes.value).filter(
        (name) => methodTypes.value[name] === 'Cash'
      )
    ),
    /** The ERPNext POS Profiles the user may open a shift for; none in standalone. */
    profiles: computed(() => profiles.value),
    /** The open shift's POS Profile, named where the user has more than one to tell apart. */
    profileLabel: computed(() =>
      profiles.value.length > 1 ? (openShift.value?.pos_profile ?? '') : ''
    ),
    /** Accessory mode needs a POS Profile to sell under. */
    hasNoProfile: computed(
      () => isAccessoryMode() && isLoaded.value && !profiles.value.length
    ),
    refresh,
  });
}

export type POSShift = ReturnType<typeof usePOSShift>;

/** The POS Profile the user opened a shift for last, if still assigned; else the first. */
export async function getDefaultProfile(profiles: string[]): Promise<string> {
  const [last] = await getList(
    getDocType(ModelNameEnum.POSOpeningEntry).doctype,
    {
      fields: ['pos_profile'],
      filters: [['user', '=', fyo.user]],
      orderBy: 'creation desc',
      limit: 1,
    }
  ).catch(() => []);
  const name = last?.pos_profile as string | undefined;
  return name && profiles.includes(name) ? name : profiles[0];
}

/** Cash counted by denomination where nothing stores the counts: only their total is saved. */
export function getCashCounter(denominations: Money[]): CashCountRow[] {
  const rows: CashCountRow[] = denominations.map((denomination, idx) => ({
    idx,
    // Money keeps private fields, which a reactive proxy cannot reach.
    denomination: markRaw(denomination),
    count: 0,
    set(_fieldname: 'count', count: number) {
      this.count = count;
    },
  }));
  return reactive(rows) as CashCountRow[];
}

async function getOpenShiftName(): Promise<string | null> {
  if (!isAccessoryMode()) {
    return await call<string | null>(GET_OPEN_SHIFT);
  }

  const entries = await call<{ name: string; company: string }[]>(
    CHECK_OPENING_ENTRY,
    { user: fyo.user }
  );
  const company = getAccessoryCompany();
  return entries.find((entry) => entry.company === company)?.name ?? null;
}

/** The accessory company's POS Profiles assigned to the user, as Desk's POS Profile pick lists them. */
async function getAssignedProfiles(): Promise<string[]> {
  if (!isAccessoryMode()) {
    return [];
  }

  const rows = await call<string[][] | Record<string, never>>(
    POS_PROFILE_QUERY,
    {
      doctype: 'POS Profile',
      txt: '',
      searchfield: 'name',
      start: 0,
      page_len: 100,
      filters: { company: getAccessoryCompany() },
    }
  );
  return Array.isArray(rows) ? rows.map(([name]) => name) : [];
}
