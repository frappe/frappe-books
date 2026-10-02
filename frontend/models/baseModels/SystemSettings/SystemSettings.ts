import { DocValue } from 'fyo/core/types';
import { ListsMap, ValidationMap } from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { t } from 'fyo/utils/translation';
import { SelectOption } from 'schemas/types';
import { FrappeDoc } from 'src/frappe/document';
import { getCountryInfo } from 'utils/misc';

/**
 * Books System Settings, served by Frappe. Its currency is Frappe's System
 * Settings currency; the DocType shows it read only.
 */
export class SystemSettings extends FrappeDoc {
  static override doctype = 'Books System Settings';
  static override presentation = {
    label: 'System Settings',
    fields: {
      date_format: {
        allowCustom: true,
        optionLabels: {
          'dd/MM/yyyy': '23/03/2022',
          'MM/dd/yyyy': '03/23/2022',
          'dd-MM-yyyy': '23-03-2022',
          'MM-dd-yyyy': '03-23-2022',
          'yyyy-MM-dd': '2022-03-23',
          'd MMM, y': '23 Mar, 2022',
          'MMM d, y': 'Mar 23, 2022',
          'dd.MM.yyyy': '23.03.2022',
        },
      },
      locale: { allowCustom: true },
    },
  };

  declare date_format?: string;
  declare locale?: string;
  declare display_precision?: number;
  declare internal_precision?: number;
  declare currency?: string;
  declare hide_get_started?: boolean;
  declare allow_filter_bypass?: boolean;
  declare remove_filter?: boolean;
  declare dark_mode?: boolean;

  // The server checks it too; mirrored to show the message at the field.
  validations: ValidationMap = {
    display_precision(value: DocValue) {
      if ((value as number) >= 0 && (value as number) <= 9) {
        return;
      }

      throw new ValidationError(
        t`Display Precision should have a value between 0 and 9.`
      );
    },
  };

  static lists: ListsMap = {
    locale() {
      const countryInfo = getCountryInfo();
      return Object.keys(countryInfo)
        .filter((c) => !!countryInfo[c]?.locale)
        .map(
          (c) =>
            ({
              value: countryInfo[c]?.locale,
              label: `${c} (${countryInfo[c]?.locale ?? t`Not Found`})`,
            }) as SelectOption
        );
    },
  };
}
