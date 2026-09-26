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
    return getAmountValues(doc.fyo, doc.grandTotal);
  }

  if (doc instanceof StockMovement) {
    return getAmountValues(doc.fyo, doc.amount);
  }

  return {};
}

async function getInvoiceTotalValues(
  invoice: Invoice
): Promise<PrintTemplateData> {
  const totalTax = await invoice.getTotalTax();
  const values: PrintTemplateData = {
    ...getAmountValues(invoice.fyo, invoice.grandTotal, totalTax),
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

  const totalTax = await taxedDoc.getTotalTax();
  const values: PrintTemplateData = {
    ...getAmountValues(payment.fyo, payment.amount, totalTax),
    amountPaidInWords: getGrandTotalInWords((payment.amountPaid as Money).float),
  };

  if (taxedDoc instanceof Invoice && taxedDoc.taxes) {
    values.taxes = taxedDoc.taxes;
  }

  return values;
}

function getAmountValues(
  fyo: Fyo,
  total: Money | undefined,
  totalTax?: Money
): PrintTemplateData {
  if (!total) {
    return {};
  }

  return {
    subTotal: formatAmount(fyo, totalTax ? total.sub(totalTax) : total),
    grandTotalInWords: getGrandTotalInWords(total.float),
  };
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
  date.setMonth(date.getMonth());

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

function getGrandTotalInWords(total: number) {
  const formattedTotal = total.toFixed(2);

  const [integerPart, decimalPart] = formattedTotal.split('.');

  const ones = [
    '',
    t`One`,
    t`Two`,
    t`Three`,
    t`Four`,
    t`Five`,
    t`Six`,
    t`Seven`,
    t`Eight`,
    t`Nine`,
  ];

  const teens = [
    t`Ten`,
    t`Eleven`,
    t`Twelve`,
    t`Thirteen`,
    t`Fourteen`,
    t`Fifteen`,
    t`Sixteen`,
    t`Seventeen`,
    t`Eighteen`,
    t`Nineteen`,
  ];

  const tens = [
    '',
    '',
    t`Twenty`,
    t`Thirty`,
    t`Forty`,
    t`Fifty`,
    t`Sixty`,
    t`Seventy`,
    t`Eighty`,
    t`Ninety`,
  ];

  const scales = ['', t`Thousand`, t`Million`, t`Billion`];

  function convertThreeDigitNumber(num: number) {
    let result = '';

    const hundredDigit = Math.floor(num / 100);
    const remainder = num % 100;

    if (hundredDigit > 0) {
      result += ones[hundredDigit] + ` ${t`Hundred`}`;
    }

    if (remainder > 0) {
      if (hundredDigit > 0) {
        result += ` ${t`And`} `;
      }

      if (remainder < 10) {
        result += ones[remainder];
      } else if (remainder < 20) {
        result += teens[remainder - 10];
      } else {
        const tensDigit = Math.floor(remainder / 10);
        const onesDigit = remainder % 10;
        result += tens[tensDigit];
        if (onesDigit > 0) {
          result += ' ' + ones[onesDigit];
        }
      }
    }

    return result;
  }

  let spelledOutInteger = '';
  const integerGroups = integerPart.match(/(\d{1,3})(?=(\d{3})*$)/g) || [];
  const groupCount = integerGroups.length;

  integerGroups.forEach((group, index) => {
    const groupValue = parseInt(group);

    if (groupValue > 0) {
      const groupText = convertThreeDigitNumber(groupValue);
      const groupSuffix = scales[groupCount - index - 1];
      spelledOutInteger +=
        groupText + (groupSuffix ? ' ' + groupSuffix : '') + ' ';
    }
  });

  spelledOutInteger = spelledOutInteger.trim() || t`Zero`;

  let spelledOutDecimal = '';
  const decimalCents = parseInt(decimalPart);

  if (decimalCents !== 0) {
    spelledOutDecimal =
      ` ${t`and`} ` + convertThreeDigitNumber(decimalCents) + ` ${t`Paisa`}`;
  }

  return `${spelledOutInteger}${spelledOutDecimal} ${t`only`}`;
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

function formattedTotalDiscount(doc: Doc): string {
  if (!(doc instanceof Invoice)) {
    return '';
  }

  const totalDiscount = doc.getTotalDiscount();
  if (!totalDiscount?.float) {
    return '';
  }

  return doc.fyo.format(totalDiscount, ModelNameEnum.Currency);
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
