import { POSOpeningShift } from 'models/inventory/Point of Sale/POSOpeningShift';
import { ModelNameEnum, PaymentMethodType } from 'models/types';
import { getAllDocuments } from 'src/frappe/api';
import { getFrappeDoc } from 'src/frappe/documents';
import { call } from 'src/web/api';
import { computed, reactive, shallowRef } from 'vue';

const GET_OPEN_SHIFT =
  'frappe_books.frappe_books.doctype.books_pos_opening_shift.books_pos_opening_shift.get_open_shift';

/**
 * The open POS shift and the payment methods it counts, as of the last
 * `refresh`. Cash methods are those of the Cash type, as on the server: the
 * counted drawer covers them all.
 */
export function usePOSShift() {
  const openShift = shallowRef<POSOpeningShift>();
  const methodTypes = shallowRef<Record<string, PaymentMethodType>>({});
  const isLoaded = shallowRef(false);

  async function refresh() {
    const [name, methods] = await Promise.all([
      call<string | null>(GET_OPEN_SHIFT),
      getAllDocuments('Books Payment Method', { fields: ['name', 'type'] }),
    ]);
    openShift.value = name
      ? ((await getFrappeDoc(
          ModelNameEnum.POSOpeningShift,
          name
        )) as POSOpeningShift)
      : undefined;
    methodTypes.value = Object.fromEntries(
      methods.map(({ name, type }) => [name, type as PaymentMethodType])
    );
    isLoaded.value = true;
  }

  return reactive({
    openShift: computed(() => openShift.value),
    isLoaded: computed(() => isLoaded.value),
    isOpen: computed(() => !!openShift.value),
    openedAt: computed(() => openShift.value?.opening_date),
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
