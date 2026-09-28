import { Action } from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { toServerFilters } from 'reports/serverReport';
import { ExportExtension } from 'reports/types';
import { handleErrorWithDialog } from 'src/errorHandling';
import { showDialog } from 'src/utils/interactive';
import { call } from 'src/web/api';
import { getCsvData, saveExportData } from '../commonExporter';
import { BaseGSTR } from './BaseGSTR';

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

  try {
    const data =
      extension === 'csv' ? getCsvData(report) : await getGstrJsonData(report);
    if (data.length) {
      saveExportData(data, `${report.reportName}.${extension}`);
    }
  } catch (error) {
    await handleErrorWithDialog(error, undefined, true);
  }
}

/** Mirrors the server's GSTIN check so the dialog explains what to set. */
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

/** The GST portal JSON, built on the server from the rows the report shows. */
export async function getGstrJsonData(report: BaseGSTR): Promise<string> {
  const data = await call('frappe_books.reports.gstr_json.get_gstr_json', {
    report_name: report.serverReportName,
    filters: toServerFilters(report.filterMap),
  });
  return JSON.stringify(data);
}
