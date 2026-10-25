import { t } from 'fyo';
import { sortBy } from 'lodash';
import { DateTime } from 'luxon';
import {
  getPaymentMethodRequirements,
  PaymentMethodRequirements,
} from 'models/baseModels/ModeOfPayment/requirements';
import type { SalesInvoicePayment } from 'models/invoices/SalesInvoicePayment';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import type { Money } from 'pesa';
import type { PaymentMethodOption } from 'src/components/POS/types';
import { getAllDocuments } from 'src/frappe/api';
import { isAccessoryMode, toActiveDoctype } from 'src/frappe/mode';
import { fyo } from 'src/initFyo';
import { call } from 'src/web/api';
import {
  computed,
  reactive,
  shallowReactive,
  shallowRef,
  watch,
  type InjectionKey,
} from 'vue';
import {
  getInvoicePayments,
  getPaymentShortcuts,
  validatePOSCheckout,
} from './pos';
import { getPOSProfile } from './posSetup';

const PAY_POS_INVOICE =
  'frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice.pay_pos_invoice';
// ERPNext Payment Entries pay a submitted POS invoice.
const PAY_ERPNEXT_POS_INVOICE = 'frappe_books.accessory.pos.pay_pos_invoice';

/** What the cashier takes for a POS sale, by Books Sales Invoice Payment fieldnames. The checkout's actions set it. */
export type Tender = {
  mode_of_payment?: string;
  amount: Money;
  reference_no?: string;
  clearance_date?: Date;
};

/** What the tenders leave due, the cash change they hand back, or what non-cash pays too much. */
export type Settlement = { label: string; amount: Money; isChange: boolean };

/** A done checkout; `payments` names its payments, and failing to name them leaves the sale done. */
export type POSCheckoutResult = {
  invoice: string;
  payments: Promise<string[]>;
};

/** The tenders of a POS sale, one per payment method; actions take a tender's index. */
export interface POSCheckout {
  /** Changed only through the actions below; there is always one. */
  readonly tenders: readonly Readonly<Tender>[];
  readonly methods: PaymentMethodOption[];
  readonly due: Money;
  readonly settlement: Settlement | null;
  /** Whether the tenders are complete enough to pay with; the server checks them again. */
  readonly canPay: boolean;
  /** Whether another tender can pay what is left: a balance remains and a method is free. */
  readonly canAddTender: boolean;
  /** The methods no other tender has. */
  getMethods(index: number): PaymentMethodOption[];
  /** What the tender's method needs with its payment. */
  getRequirements(index: number): PaymentMethodRequirements;
  /** What the other tenders leave due. */
  getRest(index: number): Money;
  /** The rest, then for cash the round amounts above it; none when nothing is left. */
  getQuickAmounts(index: number): Money[];
  selectMethod(index: number, name: string): void;
  setAmount(index: number, amount: Money | null): void;
  setReference(index: number, reference: string): void;
  setClearanceDate(index: number, date: Date): void;
  addTender(): void;
  removeTender(index: number): void;
  start(): Promise<void>;
  reset(): void;
  checkout(options: { pay: boolean }): Promise<POSCheckoutResult>;
}

export const posCheckoutKey = Symbol(
  'posCheckout'
) as InjectionKey<POSCheckout>;

/** The tenders of the POS sale `getSale` returns, what they settle, and its checkout. */
export function usePOSCheckout(getSale: () => SalesInvoice): POSCheckout {
  const tenders = shallowReactive<Tender[]>([]);
  const methods = shallowRef<PaymentMethodOption[]>([]);
  // Every preview fills it; a draft owes its whole total.
  const due = computed(() =>
    (getSale().outstanding_amount ?? fyo.pesa(0)).abs()
  );
  const isCash = (tender: Tender) =>
    getRequirements(methods.value, tender.mode_of_payment).isCash;
  const getRest = (index: number) =>
    getAtLeastZero(due.value.sub(sumAmounts(tenders, index)));
  const startTenders = (amount: Money) =>
    tenders.splice(0, tenders.length, makeTender(amount));
  const reset = () => startTenders(fyo.pesa(0));
  reset();
  // Tenders still at what was due follow it, as a coupon or points change it.
  watch(due, (next, previous) => {
    const last = tenders.at(-1)!;
    if (sumAmounts(tenders).eq(previous)) {
      last.amount = getAtLeastZero(last.amount.add(next.sub(previous)));
    }
  });

  const posCheckout = reactive({
    tenders,
    methods,
    due,
    settlement: computed(() =>
      getSettlement(tenders, due.value, !!getSale().isReturn, isCash)
    ),
    canPay: computed(
      () =>
        tenders.every((tender) =>
          isTenderComplete(
            tender,
            getRequirements(methods.value, tender.mode_of_payment)
          )
        ) && !getNonCashExcess(tenders, due.value, isCash).isPositive()
    ),
    canAddTender: computed(
      () =>
        tenders.every((tender) => tender.mode_of_payment) &&
        tenders.length < methods.value.length &&
        sumAmounts(tenders).lt(due.value)
    ),
    getMethods: (index: number) =>
      methods.value.filter(
        ({ name }) =>
          !tenders.some(
            (tender, other) =>
              other !== index && tender.mode_of_payment === name
          )
      ),
    getRequirements: (index: number) =>
      getRequirements(methods.value, tenders[index].mode_of_payment),
    getRest,
    getQuickAmounts(index: number) {
      const rest = getRest(index);
      const isCashSale = !getSale().isReturn && isCash(tenders[index]);
      return rest.isZero() ? [] : getPaymentShortcuts(rest, isCashSale);
    },
    selectMethod(index: number, name: string) {
      const tender = tenders[index];
      tender.mode_of_payment = name;
      tender.amount = getRest(index);
      dropUnneededDetails(tender, getRequirements(methods.value, name));
    },
    /** Text that is no number pays nothing, which `canPay` refuses. */
    setAmount(index: number, amount: Money | null) {
      tenders[index].amount = fyo.pesa(amount?.toString() ?? 0);
    },
    setReference(index: number, reference: string) {
      tenders[index].reference_no = reference;
    },
    setClearanceDate(index: number, date: Date) {
      tenders[index].clearance_date = date;
    },
    addTender() {
      tenders.push(makeTender(getRest(tenders.length)));
    },
    removeTender(index: number) {
      if (tenders.length > 1) {
        tenders.splice(index, 1);
      }
    },
    async start() {
      startTenders(due.value);
      methods.value = await getPaymentMethods(getSale());
    },
    reset,
    checkout: ({ pay }: { pay: boolean }) =>
      checkOutSale(
        getSale(),
        pay ? tenders.map((tender) => ({ ...tender })) : []
      ),
  });
  return posCheckout as POSCheckout;
}

/** ERPNext's return refunds its sale's payments; a POS sale or return leaves them to the cashier's tenders. */
export async function clearPayments(sale: SalesInvoice) {
  for (const row of sale.payments ?? []) {
    await row.set('amount', fyo.pesa(0));
  }
}

/** Submits a draft sale, paid with `tenders`; a submitted sale is only paid. */
async function checkOutSale(
  sale: SalesInvoice,
  tenders: Tender[]
): Promise<POSCheckoutResult> {
  if (sale.isSubmitted) {
    const names = await payInvoice(sale.name!, tenders);
    return { invoice: sale.name!, payments: Promise.resolve(names) };
  }

  await submitSale(sale, tenders);
  const invoice = sale.name!;
  // An ERPNext POS invoice holds its payments itself.
  const payments =
    tenders.length && !isAccessoryMode()
      ? getInvoicePayments(invoice)
      : Promise.resolve([]);
  return { invoice, payments };
}

function makeTender(amount: Money): Tender {
  return shallowReactive({
    mode_of_payment: undefined,
    amount,
    reference_no: undefined,
    clearance_date: undefined,
  });
}

/** The tenders' amounts, but for the one at `skip`. */
function sumAmounts(tenders: Tender[], skip?: number): Money {
  return tenders.reduce(
    (total, tender, index) =>
      index === skip ? total : total.add(tender.amount),
    fyo.pesa(0)
  );
}

function getAtLeastZero(amount: Money): Money {
  return amount.isNegative() ? fyo.pesa(0) : amount;
}

function getRequirements(
  methods: PaymentMethodOption[],
  name?: string
): PaymentMethodRequirements {
  const method = methods.find((option) => option.name === name);
  return getPaymentMethodRequirements(
    method?.type,
    method?.requires_clearance_date
  );
}

/** A method keeps only the details it asks for. */
function dropUnneededDetails(
  tender: Tender,
  requirements: PaymentMethodRequirements
) {
  if (!requirements.requiresReferenceId) {
    tender.reference_no = undefined;
  }
  if (!requirements.requiresClearanceDate) {
    tender.clearance_date = undefined;
  }
}

/** What non-cash tenders pay beyond what is due, which only cash may. */
function getNonCashExcess(
  tenders: Tender[],
  due: Money,
  isCash: (tender: Tender) => boolean
): Money {
  const nonCash = tenders.filter((tender) => !isCash(tender));
  return sumAmounts(nonCash).sub(due);
}

/** Cash beyond what is due is change, unless on a refund; short tenders leave a balance. */
function getSettlement(
  tenders: Tender[],
  due: Money,
  isReturn: boolean,
  isCash: (tender: Tender) => boolean
): Settlement | null {
  const excess = getNonCashExcess(tenders, due, isCash);
  if (excess.isPositive()) {
    return {
      label: t`Non-cash over amount due`,
      amount: excess,
      isChange: false,
    };
  }

  const paid = sumAmounts(tenders);
  const change = paid.sub(due);
  if (!isReturn && change.isPositive()) {
    return { label: t`Change to return`, amount: change, isChange: true };
  }

  const balance = due.sub(paid);
  if (paid.isPositive() && balance.isPositive()) {
    return { label: t`Balance due`, amount: balance, isChange: false };
  }

  return null;
}

function isTenderComplete(
  tender: Tender,
  requirements: PaymentMethodRequirements
): boolean {
  return Boolean(
    tender.mode_of_payment &&
    tender.amount.isPositive() &&
    (tender.reference_no || !requirements.requiresReferenceId) &&
    (tender.clearance_date || !requirements.requiresClearanceDate)
  );
}

/** The payment methods: all, or an ERPNext sale's POS Profile's. */
async function getPaymentMethods(
  sale: SalesInvoice
): Promise<PaymentMethodOption[]> {
  if (!isAccessoryMode()) {
    return (await getAllDocuments('Books Mode of Payment', {
      fields: ['name', 'type', 'requires_clearance_date'],
    })) as PaymentMethodOption[];
  }

  const profile = await getPOSProfile(sale);
  const modes = (profile?.payments ?? []).map((row) => row.mode_of_payment);
  const methods = (await getAllDocuments(
    toActiveDoctype('Books Mode of Payment'),
    { fields: ['name', 'type'], filters: [['name', 'in', modes]] }
  )) as PaymentMethodOption[];
  // In the profile's order, which puts its default first
  return sortBy(methods, ({ name }) => modes.indexOf(name));
}

/** The server pays the sale with its payments rows when it submits it. */
async function submitSale(sale: SalesInvoice, tenders: Tender[]) {
  if (isAccessoryMode()) {
    await setERPNextPayments(sale, tenders);
  } else {
    await sale.set('payments', null);
    for (const tender of tenders) {
      await sale.append('payments', tender);
    }
  }

  await validatePOSCheckout(sale);
  try {
    await sale.sync();
    await sale.submit();
  } catch (error) {
    // An ERPNext draft owes its total less its payment rows; a refused checkout leaves it unpaid.
    if (isAccessoryMode()) {
      await clearPayments(sale);
    }
    throw error;
  }
}

/**
 * An ERPNext POS invoice has a payment row per mode of its POS Profile, as
 * its preview lists them; the tenders fill theirs, a refund as a negative
 * amount, and the others pay nothing.
 */
async function setERPNextPayments(sale: SalesInvoice, tenders: Tender[]) {
  const sign = sale.isReturn ? -1 : 1;
  await clearPayments(sale);
  for (const { amount, ...tender } of tenders) {
    const row = await getPaymentRow(sale, tender.mode_of_payment);
    await row.set({ ...tender, amount: amount.mul(sign) });
  }
}

async function getPaymentRow(
  sale: SalesInvoice,
  mode?: string
): Promise<SalesInvoicePayment> {
  const row = sale.payments?.find((row) => row.mode_of_payment === mode);
  if (row) {
    return row;
  }

  await sale.append('payments', { mode_of_payment: mode });
  return sale.payments!.at(-1)!;
}

/** Pays a sale submitted earlier and returns the payment names. */
async function payInvoice(
  invoice: string,
  tenders: Tender[]
): Promise<string[]> {
  if (!tenders.length) {
    return [];
  }

  const method = isAccessoryMode() ? PAY_ERPNEXT_POS_INVOICE : PAY_POS_INVOICE;
  return await call<string[]>(method, {
    invoice,
    payments: tenders.map((tender) => ({
      ...tender,
      amount: tender.amount.float,
      clearance_date: tender.clearance_date
        ? DateTime.fromJSDate(tender.clearance_date).toISODate()
        : null,
    })),
  });
}
