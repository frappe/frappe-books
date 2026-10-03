import { DocValue } from 'fyo/core/types';
import { ListsMap, ReadOnlyMap, ValidationMap } from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { hasDocTypePermission } from 'fyo/utils/permissions';
import { t } from 'fyo/utils/translation';
import { SelectOption } from 'schemas/types';
import { FrappeDoc } from 'src/frappe/document';
import { call } from 'src/web/api';
import { getCountryInfo } from 'utils/misc';

const SET_DISPLAY_PRECISION =
  'frappe_books.frappe_books.doctype.books_system_settings.books_system_settings.set_display_precision';

/**
 * Books System Settings, served by Frappe. Its currency and display precision
 * are Frappe's System Settings currency and currency precision; a save of its
 * date format or locale sets Frappe's date or number format.
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

  // The server checks it too; mirrored to show the message at the field.
  validations: ValidationMap = {
    display_precision(value: DocValue) {
      if (
        Number.isInteger(value) &&
        (value as number) >= 0 &&
        (value as number) <= 9
      ) {
        return;
      }

      throw new ValidationError(
        t`Display Precision should have a value between 0 and 9.`
      );
    },
  };

  readOnly: ReadOnlyMap = {
    date_format: () => !this.canWriteSystemSettings,
    locale: () => !this.canWriteSystemSettings,
    display_precision: () => !this.canWriteSystemSettings,
  };

  get canWriteSystemSettings(): boolean {
    return hasDocTypePermission(
      this.fyo.store.permissions,
      'System Settings',
      'write'
    );
  }

  /** The display precision is Frappe's; a save that changes it sets it first. */
  override async beforeSync() {
    await super.beforeSync();
    // Only a change goes, so a stale copy neither sets it back nor needs the right to.
    if (this.isChanged('display_precision')) {
      await call(SET_DISPLAY_PRECISION, {
        display_precision: this.display_precision,
      });
    }
  }

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
