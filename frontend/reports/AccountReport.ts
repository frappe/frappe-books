import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import getCommonExportActions from 'reports/commonExporter';
import { Report } from 'reports/Report';
import { ServerRow } from 'reports/serverReport';
import {
  BasedOn,
  Periodicity,
  PhoneTreeLayout,
  ReportRow,
} from 'reports/types';
import { Field } from 'schemas/types';

export abstract class AccountReport extends Report {
  static phoneLayout: PhoneTreeLayout = {
    type: 'tree',
    label: 'account',
    periods: true,
    chips: ['toDate', 'fromYear', 'toYear', 'periodicity'],
  };

  toDate?: string;
  count?: number;
  fromYear?: number;
  toYear?: number;
  consolidateColumns = false;
  hideGroupAmounts = false;
  periodicity?: Periodicity;
  basedOn?: BasedOn;

  /** Required filters left empty take the value the server opens the report with. */
  async setDefaultFilters(): Promise<void> {
    const defaults = await this.getDefaultFilters();
    for (const [key, value] of Object.entries(defaults)) {
      this[key] ??= value;
    }
  }

  getReportRow(row: ServerRow): ReportRow {
    const level = Number(row.indent ?? 0);
    const reportRow = super.getReportRow(row);
    const [nameCell] = reportRow.cells;
    nameCell.bold = !level;
    nameCell.indent = level;
    return {
      ...reportRow,
      level,
      isGroup: !!row.is_group,
      // Only section totals sit at the top level without being a group.
      isTotal: !level && !row.is_group,
      folded: false,
      foldedBelow: false,
    };
  }

  getActions(): Action[] {
    return getCommonExportActions(this);
  }

  getFilters(): Field[] {
    const periodNameMap: Record<Periodicity, string> = {
      Monthly: t`Months`,
      Quarterly: t`Quarters`,
      'Half Yearly': t`Half Years`,
      Yearly: t`Years`,
    };

    const filters = [
      {
        fieldtype: 'Select',
        options: [
          { label: t`Fiscal Year`, value: 'Fiscal Year' },
          { label: t`Until Date`, value: 'Until Date' },
        ],
        label: t`Based On`,
        fieldname: 'basedOn',
      },
      {
        fieldtype: 'Select',
        options: [
          { label: t`Monthly`, value: 'Monthly' },
          { label: t`Quarterly`, value: 'Quarterly' },
          { label: t`Half Yearly`, value: 'Half Yearly' },
          { label: t`Yearly`, value: 'Yearly' },
        ],
        label: t`Periodicity`,
        fieldname: 'periodicity',
      },
    ] as Field[];

    let dateFilters = [
      {
        fieldtype: 'Int',
        fieldname: 'fromYear',
        placeholder: t`From Year`,
        label: t`From Year`,
        minvalue: 2000,
        required: true,
      },
      {
        fieldtype: 'Int',
        fieldname: 'toYear',
        placeholder: t`To Year`,
        label: t`To Year`,
        minvalue: 2000,
        required: true,
      },
    ] as Field[];

    if (this.basedOn === 'Until Date') {
      dateFilters = [
        {
          fieldtype: 'Date',
          fieldname: 'toDate',
          placeholder: t`To Date`,
          label: t`To Date`,
          required: true,
        },
        {
          fieldtype: 'Int',
          fieldname: 'count',
          minvalue: 1,
          placeholder: t`Number of ${periodNameMap[this.periodicity!]}`,
          label: t`Number of ${periodNameMap[this.periodicity!]}`,
          required: true,
        },
      ] as Field[];
    }

    return [
      filters,
      dateFilters,
      {
        fieldtype: 'Check',
        label: t`Consolidate Columns`,
        fieldname: 'consolidateColumns',
      } as Field,
      {
        fieldtype: 'Check',
        label: t`Hide Group Amounts`,
        fieldname: 'hideGroupAmounts',
      } as Field,
    ].flat();
  }
}
