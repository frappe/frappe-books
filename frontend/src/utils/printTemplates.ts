import { Fyo, t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { Invoice } from 'models/baseModels/Invoice/Invoice';
import { ModelNameEnum } from 'models/types';
import { FieldTypeEnum, Schema, TargetField } from 'schemas/types';
import { printHtml } from './browser';
import { constructPrintDocument } from './printDocument';
import { getPrintTemplateDocValues } from './printTemplateData';
import { showToast } from './interactive';
import { PrintValues } from './types';
import { CurrencyUnits, getAmountInWords } from './amountInWords';
import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from 'fyo/utils/consts';
import { Money } from 'pesa';
import { Payment } from 'models/baseModels/Payment/Payment';
import { StockMovement } from 'models/inventory/StockMovement';
import { StockTransfer } from 'models/inventory/StockTransfer';

export type PrintTemplateHint = {
  [key: string]: string | PrintTemplateHint | PrintTemplateHint[];
};
type PrintTemplateData = Record<string, unknown>;
const printSettingsFields = [
  'logo',
  'displayLogo',
  'color',
  'font',
  'email',
  'phone',
  'address',
  'companyName',
  'amountInWords',
  'displaytermsandconditions',
  'termsAndConditions',
];
const accountingSettingsFields = ['gstin', 'taxId'];

export async function getPrintTemplatePropValues(
  doc: Doc
): Promise<PrintValues> {
  const printSettings = await doc.fyo.doc.getDoc(ModelNameEnum.PrintSettings);
  const values: PrintTemplateData = {
    ...(await getPrintTemplateDocValues(doc)),
    ...(await getTotalValues(doc)),
    date: getDate(doc.date as string),
    showHSN: showHSN(doc),
  };

  if (printSettings.displayTime) {
    values.time = getTime(doc.date as string);
  }

  if (printSettings.displayDescription) {
    values.description = showDescription(doc);
  }

  return { doc: values, print: await getPrintValues(printSettings) };
}

async function getPrintValues(printSettings: Doc): Promise<PrintTemplateData> {
  const accountingSettings = await printSettings.fyo.doc.getDoc(
    ModelNameEnum.AccountingSettings
  );

  return {
    ...(await getPrintTemplateDocValues(printSettings, printSettingsFields)),
    ...(await getPrintTemplateDocValues(
      accountingSettings,
      accountingSettingsFields
    )),
  };
}

async function getTotalValues(doc: Doc): Promise<PrintTemplateData> {
  if (doc instanceof Invoice) {
    return await getInvoiceTotalValues(doc);
  }

  if (doc instanceof Payment) {
    return await getPaymentTotalValues(doc);
  }

  if (doc instanceof StockTransfer) {
    return await getAmountValues(doc, 'grandTotal');
  }

  if (doc instanceof StockMovement) {
    return await getAmountValues(doc, 'amount');
  }

  return {};
}

async function getInvoiceTotalValues(
  invoice: Invoice
): Promise<PrintTemplateData> {
  const totalTax = getTotalTax(invoice);
  const values: PrintTemplateData = {
    ...(await getAmountValues(invoice, 'grandTotal', totalTax)),
    totalDiscount: formattedTotalDiscount(invoice),
  };

  const paymentIds = invoice.isQuote ? [] : await invoice.getPaymentIds();
  if (paymentIds.length) {
    values.paymentDetails = await getPaymentDetails(invoice, paymentIds);
  }

  return values;
}

async function getPaymentTotalValues(
  payment: Payment
): Promise<PrintTemplateData> {
  const referenceName = payment.for?.[0]?.referenceName;
  let taxedDoc: Invoice | Payment = payment;
  if (payment.referenceType === ModelNameEnum.SalesInvoice && referenceName) {
    taxedDoc = (await payment.fyo.doc.getDoc(
      ModelNameEnum.SalesInvoice,
      referenceName
    )) as Invoice;
  }

  const totalTax = getTotalTax(taxedDoc);
  const values: PrintTemplateData = {
    ...(await getAmountValues(payment, 'amount', totalTax)),
    amountPaidInWords: await getDocAmountInWords(payment, 'amountPaid'),
  };

  if (taxedDoc instanceof Invoice && taxedDoc.taxes) {
    values.taxes = await Promise.all(
      taxedDoc.taxes.map((tax) => getPrintTemplateDocValues(tax))
    );
  }

  return values;
}

async function getAmountValues(
  doc: Doc,
  fieldname: string,
  totalTax?: Money
): Promise<PrintTemplateData> {
  const total = doc[fieldname] as Money | undefined;
  if (!total) {
    return {};
  }

  return {
    subTotal: formatAmount(doc.fyo, totalTax ? total.sub(totalTax) : total),
    grandTotalInWords: await getDocAmountInWords(doc, fieldname),
  };
}

async function getDocAmountInWords(doc: Doc, fieldname: string) {
  const { fyo } = doc;
  const currency =
    doc.getCurrencies[fieldname]?.() ??
    fyo.singles.SystemSettings?.currency ??
    DEFAULT_CURRENCY;
  const currencyDoc = await fyo.doc.getDoc(ModelNameEnum.Currency, currency);
  return getAmountInWords(
    (doc[fieldname] as Money).float,
    currencyDoc as CurrencyUnits,
    fyo.singles.SystemSettings?.locale ?? DEFAULT_LOCALE
  );
}

function formatAmount(fyo: Fyo, amount: Money): string {
  return fyo.format(amount, FieldTypeEnum.Currency);
}

async function getPaymentDetails(invoice: Invoice, paymentIds: string[]) {
  const { fyo } = invoice;
  const paymentDetails = [];
  let outstandingAmount = invoice.grandTotal!;

  for (const payment of paymentIds.sort()) {
    const paymentDoc = await fyo.doc.getDoc(ModelNameEnum.Payment, payment);
    outstandingAmount = outstandingAmount.sub(paymentDoc.amount as Money);

    paymentDetails.push({
      amount: formatAmount(fyo, paymentDoc.amount as Money),
      amountPaid: formatAmount(fyo, paymentDoc.amountPaid as Money),
      paymentMethod: paymentDoc.paymentMethod as string,
      outstandingAmount: formatAmount(fyo, outstandingAmount),
    });
  }

  return paymentDetails;
}

function getDate(dateString: string): string {
  const date = new Date(dateString);
  return `${date.toLocaleString('default', {
    month: 'short',
  })} ${date.getDate()}, ${date.getFullYear()}`;
}

function getTime(dateString: string): string {
  const date = new Date(dateString);

  return date.toTimeString().split(' ')[0];
}

export function getPrintTemplatePropHints(schemaName: string, fyo: Fyo) {
  const hints: PrintTemplateHint = {};
  const schema = fyo.schemaMap[schemaName]!;
  hints.doc = getPrintTemplateDocHints(schema, fyo);

  const printSettingsHints = getPrintTemplateDocHints(
    fyo.schemaMap[ModelNameEnum.PrintSettings]!,
    fyo,
    printSettingsFields
  );
  const accountingSettingsHints = getPrintTemplateDocHints(
    fyo.schemaMap[ModelNameEnum.AccountingSettings]!,
    fyo,
    accountingSettingsFields
  );

  hints.print = {
    ...printSettingsHints,
    ...accountingSettingsHints,
  };

  if (schemaName?.endsWith('Invoice')) {
    (hints.doc as PrintTemplateData).totalDiscount = fyo.t`Total Discount`;
    (hints.doc as PrintTemplateData).showHSN = fyo.t`Show HSN`;
  }

  return hints;
}

function showHSN(doc: Doc): boolean {
  const items = doc.items;
  if (!Array.isArray(items)) {
    return false;
  }

  return items.map((i: Doc) => i.hsnCode).every(Boolean);
}

function showDescription(doc: Doc): boolean {
  const description = Array.isArray(doc.items)
    ? doc.items.map((item: Doc) => item.description).filter(Boolean)
    : [];
  return description.length > 0;
}

function formattedTotalDiscount(invoice: Invoice): string {
  const totalDiscount = invoice.totalDiscount;
  if (!totalDiscount.float) {
    return '';
  }

  return invoice.fyo.format(totalDiscount, ModelNameEnum.Currency);
}

function getTotalTax(doc: Invoice | Payment): Money {
  return doc.getSum('taxes', 'amount', false) as Money;
}

function getPrintTemplateDocHints(
  schema: Schema,
  fyo: Fyo,
  fieldnames?: string[],
  linkLevel?: number
): PrintTemplateHint {
  linkLevel ??= 0;
  const hints: PrintTemplateHint = {};
  const links: PrintTemplateHint = {};

  let fields = schema.fields;
  if (fieldnames) {
    fields = fields.filter((f) => fieldnames.includes(f.fieldname));
  }

  for (const field of fields) {
    const { fieldname, fieldtype, label, meta } = field;
    if (fieldtype === FieldTypeEnum.Attachment || meta) {
      continue;
    }

    hints[fieldname] = label ?? fieldname;
    const { target } = field as TargetField;
    const targetSchema = fyo.schemaMap[target];
    if (fieldtype === FieldTypeEnum.Link && targetSchema && linkLevel < 2) {
      links[fieldname] = getPrintTemplateDocHints(
        targetSchema,
        fyo,
        undefined,
        linkLevel + 1
      );
    }

    if (fieldtype === FieldTypeEnum.Table && targetSchema) {
      hints[fieldname] = [getPrintTemplateDocHints(targetSchema, fyo)];
    }
  }

  hints.submitted = fyo.t`Submitted`;
  hints.entryType = fyo.t`Entry Type`;
  hints.entryLabel = fyo.t`Entry Label`;

  if (Object.keys(links).length) {
    hints.links = links;
  }
  return hints;
}

/** The template name that a `.template.html` or `.html` file name gives. */
export function getTemplateNameFromFile(fileName: string): string | null {
  const name = fileName.replace(/(\.template)?\.html$/, '');
  return name && name !== fileName ? name : null;
}

export async function getPathAndMakePDF(
  name: string,
  innerHTML: string,
  width: number,
  height: number,
  shouldPrint?: boolean
) {
  const html = constructPrintDocument(name, innerHTML, width, height);
  const success = await printHtml(html);
  if (success) {
    showToast({
      message: shouldPrint
        ? t`Print dialog opened`
        : t`Save as PDF dialog opened`,
      type: 'success',
    });
  } else {
    showToast({ message: t`Pop-up blocked`, type: 'error' });
  }
}

export const baseTemplate = `<main class="h-full w-full bg-white">

  <!-- Edit This Code -->
  <header class="p-4 flex justify-between border-b">
    <h2
      class="font-semibold text-2xl"
      :style="{ color: print.color }"
    >
      {{ print.companyName }}
    </h2>
    <h2 class="font-semibold text-2xl" >
      {{ doc.name }}
    </h2>
  </header>

  <div class="p-4 text-gray-600">
    Edit the code in the Template Editor on the right
    to create your own personalized custom template.
  </div>

</main>
`;
