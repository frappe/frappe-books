import { Fyo, t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { FieldTypeEnum, Schema, TargetField } from 'schemas/types';
import { call } from 'src/web/api';
import { printHtml } from './browser';
import { constructPrintDocument } from './printDocument';
import { getPrintTemplateDocValues } from './printTemplateData';
import { showToast } from './interactive';
import { PrintValues } from './types';

export type PrintTemplateHint = {
  [key: string]: string | PrintTemplateHint | PrintTemplateHint[];
};
type PrintTemplateData = Record<string, unknown>;
type PrintTotals = {
  sub_total?: number;
  grand_total_in_words?: string;
  amount_paid_in_words?: string;
  payment_details?: {
    amount: number;
    amount_paid: number;
    payment_method: string;
    outstanding_amount: number;
  }[];
  taxes?: { account: string; amount: number }[];
};
const GET_PRINT_TOTALS = 'frappe_books.ui_api.get_print_totals';
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
    ...getBlankDeductions(doc),
    ...(await getTotalValues(doc)),
    date: doc.fyo.format(doc.date, FieldTypeEnum.Date),
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

/** The totals the server computes, formatted like the document's own values. */
async function getTotalValues(doc: Doc): Promise<PrintTemplateData> {
  if (doc.notInserted) {
    return {};
  }

  const totals = await call<PrintTotals>(GET_PRINT_TOTALS, {
    source_schema: doc.schemaName,
    name: doc.name,
  });
  const { fyo } = doc;
  const values: PrintTemplateData = {
    subTotal: formatAmount(fyo, totals.sub_total),
    grandTotalInWords: totals.grand_total_in_words,
    amountPaidInWords: totals.amount_paid_in_words,
    paymentDetails: totals.payment_details?.length
      ? totals.payment_details.map((payment) => ({
          amount: formatAmount(fyo, payment.amount),
          amountPaid: formatAmount(fyo, payment.amount_paid),
          paymentMethod: payment.payment_method,
          outstandingAmount: formatAmount(fyo, payment.outstanding_amount),
        }))
      : undefined,
    taxes: totals.taxes?.length
      ? totals.taxes.map(({ account, amount }) => ({
          account,
          amount: formatAmount(fyo, amount),
        }))
      : undefined,
  };

  // Totals a document does not have leave its own values in place.
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  );
}

/** Templates show a deduction only when the document has one. */
function getBlankDeductions(doc: Doc): PrintTemplateData {
  const fieldnames = ['totalDiscount', 'loyaltyPointsAmount'];
  return Object.fromEntries(
    fieldnames
      .filter((fieldname) => (doc[fieldname] as Money | undefined)?.isZero())
      .map((fieldname) => [fieldname, ''])
  );
}

function formatAmount(fyo: Fyo, amount?: number): string | undefined {
  if (amount === undefined) {
    return undefined;
  }

  return fyo.format(fyo.pesa(amount), FieldTypeEnum.Currency);
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
