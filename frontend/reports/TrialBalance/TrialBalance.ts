import { getAccountLabel } from 'src/utils/accountLabel';
import { t } from 'fyo';
import { DateTime } from 'luxon';
import {
  AccountRootType,
  AccountRootTypeEnum,
} from 'models/baseModels/Account/types';
import {
  AccountReport,
  ACC_BAL_WIDTH,
  ACC_NAME_WIDTH,
  convertAccountRootNodesToAccountList,
  getFiscalEndpoints,
} from 'reports/AccountReport';
import {
  Account,
  AccountListNode,
  AccountNameValueMapMap,
  ColumnField,
  DateRange,
  GroupedMap,
  LedgerEntry,
  ReportCell,
  ReportData,
  ReportRow,
  RootTypeRow,
  ValueMap,
} from 'reports/types';
import { Field } from 'schemas/types';
import { QueryFilter } from 'utils/db/types';

export class TrialBalance extends AccountReport {
  static title = t`Trial Balance`;
  static reportName = 'trial-balance';

  fromDate?: string;
  toDate?: string;
  hideGroupAmounts = false;
  loading = false;

  _rawData: LedgerEntry[] = [];
  _dateRanges?: DateRange[];

  accountMap?: Record<string, Account>;

  get rootTypes(): AccountRootType[] {
    return [
      AccountRootTypeEnum.Asset,
      AccountRootTypeEnum.Liability,
      AccountRootTypeEnum.Income,
      AccountRootTypeEnum.Expense,
      AccountRootTypeEnum.Equity,
    ];
  }

  async setReportData(filter?: string, force?: boolean) {
    this.loading = true;
    if (force || filter !== 'hideGroupAmounts') {
      await this._setRawData();
    }

    const map = this._getGroupedMap(true, 'account');
    const rangeGroupedMap = await this._getGroupedByDateRanges(map);
    const accountTree = await this._getAccountTree(rangeGroupedMap);

    const rootTypeRows: RootTypeRow[] = this.rootTypes
      .map((rootType) => {
        const rootNodes = this.getRootNodes(rootType, accountTree)!;
        const rootList = convertAccountRootNodesToAccountList(rootNodes);
        return {
          rootType,
          rootNodes,
          rows: this.getReportRowsFromAccountList(rootList),
        };
      })
      .filter((row) => !!(row.rootNodes && row.rootNodes.length));

    this.reportData = await this.getReportDataFromRows(rootTypeRows);
    this.loading = false;
  }

  async getReportDataFromRows(
    rootTypeRows: RootTypeRow[]
  ): Promise<ReportData> {
    const reportData = rootTypeRows.reduce((reportData, r) => {
      reportData.push(...r.rows);
      reportData.push(this.getEmptyRow());
      return reportData;
    }, [] as ReportData);

    reportData.pop();

    return reportData;
  }

  async _getGroupedByDateRanges(
    map: GroupedMap
  ): Promise<AccountNameValueMapMap> {
    const accountValueMap: AccountNameValueMapMap = new Map();

    for (const account of map.keys()) {
      const valueMap: ValueMap = new Map();

      for (const [index, range] of this._dateRanges!.entries()) {
        let debit = 0;
        let credit = 0;
        for (const entry of map.get(account)!) {
          const date = DateTime.fromISO(
            entry.date!.toISOString().split('T')[0]
          );
          if (date < range.fromDate || date >= range.toDate) {
            continue;
          }
          debit += entry.debit ?? 0;
          credit += entry.credit ?? 0;
        }
        // Opening and closing are balances; the period columns show turnover.
        if (index !== 1) {
          const balance = debit - credit;
          debit = Math.max(balance, 0);
          credit = Math.max(-balance, 0);
        }
        valueMap.set(range, { debit, credit });
      }

      accountValueMap.set(account, valueMap);
    }

    return accountValueMap;
  }

  async _getDateRanges(): Promise<DateRange[]> {
    if (!this.toDate || !this.fromDate) {
      await this.setDefaultFilters();
    }

    const toDate = DateTime.fromISO(this.toDate!).plus({ days: 1 });
    const fromDate = DateTime.fromISO(this.fromDate!);

    return [
      {
        fromDate: DateTime.fromISO('0001-01-01'),
        toDate: fromDate,
      },
      { fromDate, toDate },
      {
        fromDate: DateTime.fromISO('0001-01-01'),
        toDate,
      },
    ];
  }

  getRowFromAccountListNode(al: AccountListNode) {
    const nameCell = {
      value: getAccountLabel(al.name),
      rawValue: al.name,
      align: 'left',
      width: ACC_NAME_WIDTH,
      bold: !al.level,
      indent: al.level ?? 0,
    } as ReportCell;

    const balanceCells = this._dateRanges!.map((k) => {
      const map = al.valueMap?.get(k);
      const hide = this.hideGroupAmounts && al.isGroup;

      return [
        {
          rawValue: map?.debit ?? 0,
          value: hide ? '' : this.fyo.format(map?.debit ?? 0, 'Currency'),
          align: 'right',
          width: ACC_BAL_WIDTH,
        },
        {
          rawValue: map?.credit ?? 0,
          value: hide ? '' : this.fyo.format(map?.credit ?? 0, 'Currency'),
          align: 'right',
          width: ACC_BAL_WIDTH,
        } as ReportCell,
      ];
    });

    return {
      cells: [nameCell, balanceCells].flat(2),
      level: al.level,
      isGroup: !!al.isGroup,
      folded: false,
      foldedBelow: false,
    } as ReportRow;
  }

  async _getQueryFilters(): Promise<QueryFilter> {
    const filters: QueryFilter = {};
    filters.reverted = false;
    if (this.toDate) {
      filters.date = [
        '<',
        DateTime.fromISO(this.toDate).plus({ days: 1 }).toISODate(),
      ];
    }
    return filters;
  }

  async setDefaultFilters(): Promise<void> {
    if (!this.toDate || !this.fromDate) {
      const { year } = DateTime.now();
      const endpoints = await getFiscalEndpoints(year + 1, year, this.fyo);

      this.fromDate = endpoints.fromDate;
      this.toDate = DateTime.fromISO(endpoints.toDate)
        .minus({ days: 1 })
        .toISODate();
    }

    await this._setDateRanges();
  }

  getFilters(): Field[] {
    return [
      {
        fieldtype: 'Date',
        fieldname: 'fromDate',
        placeholder: t`From Date`,
        label: t`From Date`,
        required: true,
      },
      {
        fieldtype: 'Date',
        fieldname: 'toDate',
        placeholder: t`To Date`,
        label: t`To Date`,
        required: true,
      },
      {
        fieldtype: 'Check',
        label: t`Hide Group Amounts`,
        fieldname: 'hideGroupAmounts',
      } as Field,
    ] as Field[];
  }

  getColumns(): ColumnField[] {
    return [
      {
        label: t`Account`,
        fieldtype: 'Link',
        fieldname: 'account',
        align: 'left',
        width: ACC_NAME_WIDTH,
      },
      {
        label: t`Opening (Dr)`,
        fieldtype: 'Data',
        fieldname: 'openingDebit',
        align: 'right',
        width: ACC_BAL_WIDTH,
      },
      {
        label: t`Opening (Cr)`,
        fieldtype: 'Data',
        fieldname: 'openingCredit',
        align: 'right',
        width: ACC_BAL_WIDTH,
      },
      {
        label: t`Debit`,
        fieldtype: 'Data',
        fieldname: 'debit',
        align: 'right',
        width: ACC_BAL_WIDTH,
      },
      {
        label: t`Credit`,
        fieldtype: 'Data',
        fieldname: 'credit',
        align: 'right',
        width: ACC_BAL_WIDTH,
      },
      {
        label: t`Closing (Dr)`,
        fieldtype: 'Data',
        fieldname: 'closingDebit',
        align: 'right',
        width: ACC_BAL_WIDTH,
      },
      {
        label: t`Closing (Cr)`,
        fieldtype: 'Data',
        fieldname: 'closingCredit',
        align: 'right',
        width: ACC_BAL_WIDTH,
      },
    ] as ColumnField[];
  }
}
