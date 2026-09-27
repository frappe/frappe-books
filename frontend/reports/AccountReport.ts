import { getAccountLabel } from 'src/utils/accountLabel';
import { Fyo, t } from 'fyo';
import { Action } from 'fyo/model/types';
import { DateTime } from 'luxon';
import { AccountRootType } from 'models/baseModels/Account/types';
import { ModelNameEnum } from 'models/types';
import getCommonExportActions from 'reports/commonExporter';
import { Report } from 'reports/Report';
import {
  AccountSection,
  BasedOn,
  ColumnField,
  DateRange,
  Periodicity,
  ReportAccount,
  ReportCell,
  ReportData,
  ReportRow,
} from 'reports/types';
import { Field } from 'schemas/types';

export const ACC_NAME_WIDTH = 2;
export const ACC_BAL_WIDTH = 1.25;

export abstract class AccountReport extends Report {
  toDate?: string;
  count = 3;
  fromYear?: number;
  toYear?: number;
  consolidateColumns = false;
  hideGroupAmounts = false;
  periodicity: Periodicity = 'Monthly';
  basedOn: BasedOn = 'Until Date';

  _dateRanges?: DateRange[];

  async setDefaultFilters(): Promise<void> {
    if (this.basedOn === 'Until Date' && !this.toDate) {
      this.toDate = DateTime.now().plus({ days: 1 }).toISODate();
    }

    if (this.basedOn === 'Fiscal Year' && !this.toYear) {
      this.fromYear = DateTime.now().year;
      this.toYear = this.fromYear + 1;
    }

    await this._setDateRanges();
  }

  async _setDateRanges() {
    this._dateRanges = await this._getDateRanges();
  }

  /** Periods of the value columns, newest first; `toDate` is exclusive. */
  _getPeriods() {
    return this._dateRanges!.map(({ fromDate, toDate }) => ({
      fromDate: fromDate.toISODate(),
      toDate: toDate.toISODate(),
    }));
  }

  getEmptyRow(): ReportRow {
    return {
      isEmpty: true,
      cells: this.getColumns().map(
        (c) =>
          ({
            value: '',
            rawValue: '',
            width: c.width,
            align: 'left',
          }) as ReportCell
      ),
    };
  }

  getSectionRows(
    sections: AccountSection[],
    totalLabels: Partial<Record<AccountRootType, string>> = {}
  ): ReportData {
    const reportData: ReportData = [];
    for (const { rootType, accounts, total } of sections) {
      reportData.push(
        ...accounts.map((account) => this.getAccountRow(account))
      );
      const totalLabel = totalLabels[rootType];
      if (totalLabel) {
        reportData.push(this.getTotalRow(totalLabel, total));
      }

      reportData.push(this.getEmptyRow());
    }

    reportData.pop();
    return reportData;
  }

  getTotalRow(name: string, values: number[]): ReportRow {
    return this.getAccountRow({ name, level: 0, isGroup: false, values });
  }

  getAccountRow({ name, level, isGroup, values }: ReportAccount): ReportRow {
    const nameCell = {
      value: getAccountLabel(name),
      rawValue: name,
      align: 'left',
      width: ACC_NAME_WIDTH,
      bold: !level,
      indent: level,
    } as ReportCell;

    const hide = this.hideGroupAmounts && isGroup;
    const valueCells = values.map(
      (rawValue) =>
        ({
          rawValue,
          value: hide ? '' : this.fyo.format(rawValue, 'Currency'),
          align: 'right',
          width: ACC_BAL_WIDTH,
        }) as ReportCell
    );

    return {
      cells: [nameCell, ...valueCells],
      level,
      isGroup,
      folded: false,
      foldedBelow: false,
    };
  }

  getActions(): Action[] {
    return getCommonExportActions(this);
  }

  // Fix arithmetic on dates when adding or subtracting months. If the
  // reference date was the last day in month, ensure that the resulting date is
  // also the last day.
  _fixMonthsJump(refDate: DateTime, date: DateTime): DateTime {
    if (refDate.day == refDate.daysInMonth && date.day != date.daysInMonth) {
      return date.set({ day: date.daysInMonth });
    } else {
      return date;
    }
  }

  async _getDateRanges(): Promise<DateRange[]> {
    const endpoints = await this._getFromAndToDates();
    const fromDate = DateTime.fromISO(endpoints.fromDate);
    const toDate = DateTime.fromISO(endpoints.toDate);

    if (this.consolidateColumns) {
      return [
        {
          toDate,
          fromDate,
        },
      ];
    }

    const months: number = monthsMap[this.periodicity];
    const dateRanges: DateRange[] = [
      {
        toDate,
        fromDate: this._fixMonthsJump(toDate, toDate.minus({ months })),
      },
    ];

    let count = this.count ?? 1;
    if (this.basedOn === 'Fiscal Year') {
      count = Math.ceil(((this.toYear! - this.fromYear!) * 12) / months);
    }

    for (let i = 1; i < count; i++) {
      const lastRange = dateRanges.at(-1)!;
      dateRanges.push({
        toDate: lastRange.fromDate,
        fromDate: this._fixMonthsJump(
          toDate,
          lastRange.fromDate.minus({ months })
        ),
      });
    }

    return dateRanges.sort((a, b) => b.toDate.toMillis() - a.toDate.toMillis());
  }

  async _getFromAndToDates() {
    let toDate: string;
    let fromDate: string;

    if (this.basedOn === 'Until Date') {
      toDate = DateTime.fromISO(this.toDate!).plus({ days: 1 }).toISODate();
      const months = monthsMap[this.periodicity] * Math.max(this.count ?? 1, 1);
      fromDate = DateTime.fromISO(this.toDate!).minus({ months }).toISODate();
    } else {
      const fy = await getFiscalEndpoints(
        this.toYear!,
        this.fromYear!,
        this.fyo
      );
      toDate = DateTime.fromISO(fy.toDate).plus({ days: 1 }).toISODate();
      fromDate = fy.fromDate;
    }

    return { fromDate, toDate };
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
          placeholder: t`Number of ${periodNameMap[this.periodicity]}`,
          label: t`Number of ${periodNameMap[this.periodicity]}`,
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

  getColumns(): ColumnField[] {
    const columns = [
      {
        label: t`Account`,
        fieldtype: 'Link',
        fieldname: 'account',
        align: 'left',
        width: ACC_NAME_WIDTH,
      },
    ] as ColumnField[];

    const dateColumns = this._dateRanges!.map((d) => {
      const toDate = d.toDate.minus({ days: 1 });
      const label = this.fyo.format(toDate.toJSDate(), 'Date');

      return {
        label,
        fieldtype: 'Data',
        fieldname: 'toDate',
        key: `toDate:${toDate.toISODate()}`,
        align: 'right',
        width: ACC_BAL_WIDTH,
      } as ColumnField;
    });

    return [columns, dateColumns].flat();
  }

  metaFilters: string[] = ['basedOn'];
}

export async function getFiscalEndpoints(
  toYear: number,
  fromYear: number,
  fyo: Fyo
) {
  const fys = (await fyo.getValue(
    ModelNameEnum.AccountingSettings,
    'fiscalYearStart'
  )) as Date;
  const fye = (await fyo.getValue(
    ModelNameEnum.AccountingSettings,
    'fiscalYearEnd'
  )) as Date;

  /**
   * Get the month and the day, and
   * prepend with the passed year.
   */

  const fromDate = [
    fromYear,
    (fys.getMonth() + 1).toString().padStart(2, '0'),
    fys.getDate().toString().padStart(2, '0'),
  ].join('-');

  const toDate = [
    toYear,
    (fye.getMonth() + 1).toString().padStart(2, '0'),
    fye.getDate().toString().padStart(2, '0'),
  ].join('-');

  return { fromDate, toDate };
}

const monthsMap: Record<Periodicity, number> = {
  Monthly: 1,
  Quarterly: 3,
  'Half Yearly': 6,
  Yearly: 12,
};
