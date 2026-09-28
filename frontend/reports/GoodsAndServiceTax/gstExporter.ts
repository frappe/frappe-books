import { Action } from 'fyo/model/types';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import { codeStateMap } from 'regional/in';
import { ExportExtension } from 'reports/types';
import { showDialog } from 'src/utils/interactive';
import { invertMap } from 'utils';
import { getCsvData, saveExportData } from '../commonExporter';
import { BaseGSTR } from './BaseGSTR';
import { GSTRRow, TransferTypeEnum } from './types';

interface GSTData {
  version: string;
  hash: string;
  gstin: string;
  fp: string;
  b2b?: B2BCustomer[];
  b2cl?: B2CLStateInvoiceRecord[];
  b2cs?: B2CSInvRecord[];
}

interface B2BCustomer {
  ctin: string;
  inv: B2BInvRecord[];
}

interface B2BInvRecord {
  inum: string;
  idt: string;
  val: number;
  pos: string;
  rchrg: 'Y' | 'N';
  inv_typ: string;
  itms: B2BItmRecord[];
}

interface B2BItmRecord {
  num: number;
  itm_det: {
    txval: number;
    rt: number;
    csamt: number;
    camt: number;
    samt: number;
    iamt: number;
  };
}

interface B2CLInvRecord {
  inum: string;
  idt: string;
  val: number;
  itms: B2CLItmRecord[];
}

interface B2CLItmRecord {
  num: number;
  itm_det: {
    txval: number;
    rt: number;
    csamt: 0;
    iamt: number;
  };
}

interface B2CLStateInvoiceRecord {
  pos: string;
  inv: B2CLInvRecord[];
}

interface B2CSInvRecord {
  sply_ty: 'INTRA' | 'INTER';
  pos: string;
  typ: 'OE'; // "OE" -  Errors and omissions excepted.
  txval: number;
  rt: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

export default function getGSTRExportActions(report: BaseGSTR): Action[] {
  const exportExtension = ['csv', 'json'] as ExportExtension[];

  return exportExtension.map((ext) => ({
    group: `Export`,
    label: ext.toUpperCase(),
    type: 'primary',
    action: async () => {
      await exportReport(ext, report);
    },
  }));
}

async function exportReport(extension: ExportExtension, report: BaseGSTR) {
  const canExport = await getCanExport(report);
  if (!canExport) {
    return;
  }

  let data = '';

  if (extension === 'csv') {
    data = getCsvData(report);
  } else if (extension === 'json') {
    data = await getGstrJsonData(report);
  }

  if (!data.length) {
    return;
  }

  saveExportData(data, `${report.reportName}.${extension}`);
}

async function getCanExport(report: BaseGSTR) {
  const gstin = await report.fyo.getValue(
    ModelNameEnum.AccountingSettings,
    'gstin'
  );
  if (gstin) {
    return true;
  }

  await showDialog({
    title: report.fyo.t`Cannot Export`,
    detail: report.fyo.t`Please set GSTIN in General Settings.`,
    type: 'error',
  });

  return false;
}

export async function getGstrJsonData(report: BaseGSTR): Promise<string> {
  const toDate = report.toDate!;
  const transferType = report.transferType!;
  const gstin = await report.fyo.getValue(
    ModelNameEnum.AccountingSettings,
    'gstin'
  );

  const gstData: GSTData = {
    version: 'GST3.0.4',
    hash: 'hash',
    gstin: gstin as string,
    fp: DateTime.fromISO(toDate).toFormat('MMyyyy'),
  };

  if (transferType === TransferTypeEnum.B2B) {
    gstData.b2b = generateB2bData(report);
  } else if (transferType === TransferTypeEnum.B2CL) {
    gstData.b2cl = generateB2clData(report);
  } else if (transferType === TransferTypeEnum.B2CS) {
    gstData.b2cs = generateB2csData(report);
  }

  return JSON.stringify(gstData);
}

function generateB2bData(report: BaseGSTR): B2BCustomer[] {
  const b2b: B2BCustomer[] = [];
  for (const rows of getInvoiceRows(report)) {
    const [row] = rows;
    const invRecord: B2BInvRecord = {
      inum: row.invoice_no,
      idt: getInvoiceDate(row),
      val: row.invoice_value,
      pos: row.gstin && row.gstin.substring(0, 2),
      rchrg: row.reverse_charge,
      inv_typ: 'R',
      itms: rows.map((rateRow, i) => ({
        num: i + 1,
        itm_det: {
          txval: rateRow.taxable_value,
          rt: rateRow.rate,
          csamt: 0,
          camt: rateRow.cgst_amount ?? 0,
          samt: rateRow.sgst_amount ?? 0,
          iamt: rateRow.igst_amount ?? 0,
        },
      })),
    };

    const customerRecord = b2b.find((b) => b.ctin === row.gstin);
    if (customerRecord) {
      customerRecord.inv.push(invRecord);
    } else {
      b2b.push({ ctin: row.gstin, inv: [invRecord] });
    }
  }

  return b2b;
}

function generateB2clData(report: BaseGSTR): B2CLStateInvoiceRecord[] {
  const b2cl: B2CLStateInvoiceRecord[] = [];
  const stateCodeMap = invertMap(codeStateMap);
  for (const rows of getInvoiceRows(report)) {
    const [row] = rows;
    const invRecord: B2CLInvRecord = {
      inum: row.invoice_no,
      idt: getInvoiceDate(row),
      val: row.invoice_value,
      itms: rows.map((rateRow, i) => ({
        num: i + 1,
        itm_det: {
          txval: rateRow.taxable_value,
          rt: rateRow.rate,
          csamt: 0,
          iamt: rateRow.igst_amount ?? 0,
        },
      })),
    };

    const pos = stateCodeMap[row.place];
    const stateRecord = b2cl.find((b) => b.pos === pos);
    if (stateRecord) {
      stateRecord.inv.push(invRecord);
    } else {
      b2cl.push({ pos, inv: [invRecord] });
    }
  }

  return b2cl;
}

/** Rows of each invoice; the report has one row per invoice and tax rate. */
function getInvoiceRows(report: BaseGSTR): GSTRRow[][] {
  const invoices = new Map<string, GSTRRow[]>();
  for (const row of report.gstrRows ?? []) {
    invoices.set(row.invoice_no, [...(invoices.get(row.invoice_no) ?? []), row]);
  }

  return [...invoices.values()];
}

function getInvoiceDate(row: GSTRRow) {
  return DateTime.fromISO(row.invoice_date).toFormat('dd-MM-yyyy');
}

function generateB2csData(report: BaseGSTR): B2CSInvRecord[] {
  const stateCodeMap = invertMap(codeStateMap);
  const b2cs: B2CSInvRecord[] = [];

  for (const row of report.gstrRows ?? []) {
    const invRecord: B2CSInvRecord = {
      sply_ty: row.in_state ? 'INTRA' : 'INTER',
      pos: stateCodeMap[row.place],
      typ: 'OE',
      txval: row.taxable_value,
      rt: row.rate,
      iamt: !row.in_state ? (row.taxable_value * row.rate) / 100 : 0,
      camt: row.in_state ? row.cgst_amount ?? 0 : 0,
      samt: row.in_state ? row.sgst_amount ?? 0 : 0,
      csamt: 0,
    };

    b2cs.push(invRecord);
  }

  return b2cs;
}
