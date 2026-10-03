import { t } from 'fyo';
import { DateTime } from 'luxon';
import {
  getPaymentMethodRequirements,
  PaymentMethodRequirements,
} from 'models/baseModels/PaymentMethod/requirements';
import type { SalesInvoice } from 'models/invoices/SalesInvoice';
import type { Money } from 'pesa';
import type { PaymentMethodOption } from 'src/components/POS/types';
import { getAllDocuments } from 'src/frappe/api';
import { fyo } from 'src/initFyo';
import { call } from 'src/web/api';
import {
  computed,
  reactive,
  shallowReactive,
  shallowRef,
  type InjectionKey,
} from 'vue';
import {
  getInvoicePayments,
  getPaymentShortcuts,
  validatePOSCheckout,
} from './pos';

const PAY_POS_INVOICE =
  'frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice.pay_pos_invoice';

/** What the cashier takes for a POS sale, by Books Sales Invoice Payment fieldnames. Its amount is set with `setAmount`. */
export type Tender = {
  payment_method?: string;
  amount: Money;
  reference_id?: string;
  clearance_date?: Date;
};

/** What the tender leaves due, or the cash change it hands back. */
export type Settlement = { label: string; amount: Money; isChange: boolean };

/** A done checkout; `payments` names its payments, and failing to name them leaves the sale done. */
export type POSCheckoutResult = {
  invoice: string;
  payments: Promise<string[]>;
};

export interface POSCheckout {
  readonly tender: Tender;
  readonly methods: PaymentMethodOption[];
  /** What the chosen method needs with its payment. */
  readonly requirements: PaymentMethodRequirements;
  readonly due: Money;
  readonly quickAmounts: Money[];
  readonly settlement: Settlement | null;
  /** Whether the tender is complete enough to pay with; the server checks it again. */
  readonly canPay: boolean;
  selectMethod(name: string): void;
  setAmount(amount: Money | null): void;
  start(): Promise<void>;
  reset(): void;
  checkout(options: { pay: boolean }): Promise<POSCheckoutResult>;
}

export const posCheckoutKey = Symbol(
  'posCheckout'
) as InjectionKey<POSCheckout>;

/** The tender of the POS sale `getSale` returns, what it settles, and its checkout. */
export function usePOSCheckout(getSale: () => SalesInvoice): POSCheckout {
  const tender = shallowReactive<Tender>(getEmptyTender());
  const methods = shallowRef<PaymentMethodOption[]>([]);
  const requirements = computed(() =>
    getRequirements(methods.value, tender.payment_method)
  );
  // Every preview fills it; a draft owes its whole total.
  const due = computed(() =>
    (getSale().outstanding_amount ?? fyo.pesa(0)).abs()
  );
  const isCashSale = computed(
    () => !getSale().isReturn && requirements.value.isCash
  );
  const reset = () => Object.assign(tender, getEmptyTender());

  const posCheckout = reactive({
    tender,
    methods,
    requirements,
    due,
    quickAmounts: computed(() =>
      getPaymentShortcuts(due.value, isCashSale.value)
    ),
    settlement: computed(() =>
      getSettlement(tender.amount, due.value, isCashSale.value)
    ),
    canPay: computed(() => isTenderComplete(tender, requirements.value)),
    selectMethod(name: string) {
      tender.payment_method = name;
      tender.amount = due.value;
      dropUnneededDetails(tender, requirements.value);
    },
    /** Text that is no number pays nothing, which `canPay` refuses. */
    setAmount(amount: Money | null) {
      tender.amount = fyo.pesa(amount?.toString() ?? 0);
    },
    async start() {
      reset();
      tender.amount = due.value;
      methods.value = await getPaymentMethods();
    },
    reset,
    checkout: ({ pay }: { pay: boolean }) =>
      checkOutSale(getSale(), pay ? [{ ...tender }] : []),
  });
  return posCheckout as POSCheckout;
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
  const payments = tenders.length
    ? getInvoicePayments(invoice)
    : Promise.resolve([]);
  return { invoice, payments };
}

function getEmptyTender(): Tender {
  return {
    payment_method: undefined,
    amount: fyo.pesa(0),
    reference_id: undefined,
    clearance_date: undefined,
  };
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
    tender.reference_id = undefined;
  }
  if (!requirements.requiresClearanceDate) {
    tender.clearance_date = undefined;
  }
}

/** Cash beyond what is due is change; a short tender leaves a balance. */
function getSettlement(
  amount: Money,
  due: Money,
  isCashSale: boolean
): Settlement | null {
  const change = amount.sub(due);
  if (isCashSale && change.isPositive()) {
    return { label: t`Change to return`, amount: change, isChange: true };
  }

  const balance = due.sub(amount);
  if (amount.isPositive() && balance.isPositive()) {
    return { label: t`Balance due`, amount: balance, isChange: false };
  }

  return null;
}

function isTenderComplete(
  tender: Tender,
  requirements: PaymentMethodRequirements
): boolean {
  return Boolean(
    tender.payment_method &&
    tender.amount.isPositive() &&
    (tender.reference_id || !requirements.requiresReferenceId) &&
    (tender.clearance_date || !requirements.requiresClearanceDate)
  );
}

async function getPaymentMethods(): Promise<PaymentMethodOption[]> {
  return (await getAllDocuments('Books Payment Method', {
    fields: ['name', 'type', 'requires_clearance_date'],
  })) as PaymentMethodOption[];
}

/** The server pays the sale with its payments rows when it submits it. */
async function submitSale(sale: SalesInvoice, tenders: Tender[]) {
  await sale.set('payments', null);
  for (const tender of tenders) {
    await sale.append('payments', tender);
  }

  await validatePOSCheckout(sale);
  await sale.sync();
  await sale.submit();
}

/** Pays a sale submitted earlier and returns the payment names. */
async function payInvoice(
  invoice: string,
  tenders: Tender[]
): Promise<string[]> {
  if (!tenders.length) {
    return [];
  }

  return await call<string[]>(PAY_POS_INVOICE, {
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
