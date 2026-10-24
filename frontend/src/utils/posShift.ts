import { POSOpeningEntry } from 'models/inventory/Point of Sale/POSOpeningEntry';
import { ModelNameEnum, ModeOfPaymentType } from 'models/types';
import { getAllDocuments } from 'src/frappe/api';
import { getFrappeDoc } from 'src/frappe/documents';
import { call } from 'src/web/api';
import { computed, reactive, shallowRef } from 'vue';

const GET_OPEN_SHIFT =
  'frappe_books.frappe_books.doctype.books_pos_opening_entry.books_pos_opening_entry.get_open_shift';

/**
 * The open POS shift and the payment methods it counts, as of the last
 * `refresh`. Cash methods are those of the Cash type, as on the server: the
 * counted drawer covers them all.
 */
export function usePOSShift() {
  const openShift = shallowRef<POSOpeningEntry>();
  const methodTypes = shallowRef<Record<string, ModeOfPaymentType>>({});
  const isLoaded = shallowRef(false);

  async function refresh() {
    const [name, methods] = await Promise.all([
      call<string | null>(GET_OPEN_SHIFT),
      getAllDocuments('Books Mode of Payment', { fields: ['name', 'type'] }),
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
    refresh,
  });
}

export type POSShift = ReturnType<typeof usePOSShift>;
