import { Doc } from 'fyo/model/doc';
import {
  DefaultMap,
  FormulaMap,
  ListsMap,
  ValidationMap,
} from 'fyo/model/types';
import { validateEmail } from 'fyo/model/validationFunction';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import { getCountryInfo, getFiscalYear } from 'utils/misc';

function getCurrencyList(): { countryCode: string; name: string }[] {
  const result: { countryCode: string; name: string }[] = [];
  const countryInfo = getCountryInfo();
  for (const info of Object.values(countryInfo)) {
    const { currency, code } = info ?? {};
    if (typeof currency !== 'string' || typeof code !== 'string') {
      continue;
    }

    result.push({ name: currency, countryCode: code });
  }
  return result;
}

export class SetupWizard extends Doc {
  fiscalYearEnd?: Date;
  fiscalYearStart?: Date;

  formulas: FormulaMap = {
    fiscalYearStart: {
      formula: (fieldname?: string) => {
        if (
          fieldname === 'fiscalYearEnd' &&
          this.fiscalYearEnd &&
          !this.fiscalYearStart
        ) {
          return DateTime.fromJSDate(this.fiscalYearEnd)
            .minus({ years: 1 })
            .plus({ days: 1 })
            .toJSDate();
        }

        if (!this.country) {
          return;
        }

        const countryInfo = getCountryInfo();
        const fyStart =
          countryInfo[this.country as string]?.fiscal_year_start ?? '';
        return getFiscalYear(fyStart, true);
      },
      dependsOn: ['country', 'fiscalYearEnd'],
    },
    fiscalYearEnd: {
      formula: (fieldname?: string) => {
        if (
          fieldname === 'fiscalYearStart' &&
          this.fiscalYearStart &&
          !this.fiscalYearEnd
        ) {
          return DateTime.fromJSDate(this.fiscalYearStart)
            .plus({ years: 1 })
            .minus({ days: 1 })
            .toJSDate();
        }

        if (!this.country) {
          return;
        }

        const countryInfo = getCountryInfo();
        const fyEnd =
          countryInfo[this.country as string]?.fiscal_year_end ?? '';
        return getFiscalYear(fyEnd, false);
      },
      dependsOn: ['country', 'fiscalYearStart'],
    },
    currency: {
      formula: async () => {
        const country = this.get('country');
        if (typeof country !== 'string') {
          return;
        }

        const countryInfo = getCountryInfo();
        const { code } = countryInfo[country] ?? {};
        if (!code) {
          return;
        }

        const currencyList = getCurrencyList();
        const currency = currencyList.find(
          ({ countryCode }) => countryCode === code
        );

        const name = currency?.name ?? currencyList[0].name;
        // Some of these currencies are gone from Frappe's Currency list.
        if (await this.fyo.db.exists(ModelNameEnum.Currency, name)) {
          return name;
        }
      },
      dependsOn: ['country'],
    },
    chartOfAccounts: {
      formula: () => {
        const country = this.get('country') as string | undefined;
        if (country === undefined) {
          return;
        }

        const countryInfo = getCountryInfo();
        const code = countryInfo[country]?.code;
        if (!code) {
          return;
        }
        const charts = this.fyo.store.chartsOfAccounts;
        const language = (this.fyo.store.language || 'en')
          .toLowerCase()
          .split(/[-_]/)[0];
        const chart = charts.find(
          (option) =>
            option.country_code === code &&
            (!option.language || option.language === language)
        );
        return chart?.name ?? charts[0]?.name;
      },
      dependsOn: ['country'],
    },
  };

  validations: ValidationMap = {
    email: validateEmail,
  };

  static defaults: DefaultMap = {
    // Frappe's setup sets the system time zone; the browser's is the best guess.
    timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  static lists: ListsMap = {
    chartOfAccounts: (doc) =>
      (doc?.fyo.store.chartsOfAccounts ?? []).map(({ name, label }) => ({
        value: name,
        label,
      })),
  };
}
