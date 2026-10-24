import { t } from 'fyo';
import type { DocValue } from 'fyo/core/types';
import { ValidationError } from 'fyo/utils/errors';
import { POSProfile } from 'models/baseModels/POSProfile/PosProfile';
import { ModelNameEnum } from 'models/types';
import type { Money } from 'pesa';
import { ItemVisibility } from 'src/components/POS/types';
import type { DocValues } from 'src/frappe/api';
import type { FrappeDoc } from 'src/frappe/document';
import { getFrappeDoc } from 'src/frappe/documents';
import { isAccessoryMode } from 'src/frappe/mode';
import { fyo } from 'src/initFyo';
import { call } from 'src/web/api';
import { shallowRef } from 'vue';
import { showToast } from './interactive';

const GET_POS_PREFERENCES = 'frappe_books.accessory.pos.get_pos_preferences';

export type POSPermissions = {
  canChangeRate: boolean;
  canEditDiscount: boolean;
};

// Accessory mode's copy of Books' POS screen preferences, which the server reads for every user.
const accessoryPreferences = shallowRef<DocValues>({});

/** Reads Books' POS screen preferences in accessory mode; standalone reads them from the settings. */
export async function loadPOSPreferences() {
  if (isAccessoryMode()) {
    accessoryPreferences.value = await call<DocValues>(GET_POS_PREFERENCES);
  }
}

/** A POS screen preference, like a button colour: of POS Settings, else Defaults. */
export function getPOSPreference(fieldname: string): DocValue {
  if (isAccessoryMode()) {
    return accessoryPreferences.value[fieldname] as DocValue;
  }

  return (fyo.singles.POSSettings?.[fieldname] ??
    fyo.singles.Defaults?.[fieldname]) as DocValue;
}

/** The notes and coins the POS counts cash in. */
export function getCashDenominations(): Money[] {
  if (isAccessoryMode()) {
    const values = accessoryPreferences.value.pos_cash_denominations;
    return ((values ?? []) as number[]).map((value) => fyo.pesa(value));
  }

  return (fyo.singles.Defaults?.pos_cash_denominations ?? [])
    .map(({ denomination }) => denomination)
    .filter((denomination): denomination is Money => !!denomination);
}

/** The POS profile in use: the sale's, from its shift, in accessory mode; else the one POS Settings names. */
export async function getPOSProfile(
  sale?: FrappeDoc
): Promise<POSProfile | undefined> {
  const name = isAccessoryMode()
    ? (sale?.pos_profile as string | undefined)
    : fyo.singles.POSSettings?.pos_profile;
  if (!name) {
    return undefined;
  }

  return (await getFrappeDoc(ModelNameEnum.POSProfile, name)) as POSProfile;
}

/** What the POS profile in use, else POS Settings, lets the cashier change. */
export async function getPOSPermissions(
  sale?: FrappeDoc
): Promise<POSPermissions> {
  const source = (await getPOSProfile(sale)) ?? fyo.singles.POSSettings;
  return {
    canChangeRate: !!source?.allow_rate_change,
    canEditDiscount: !!source?.allow_discount_change,
  };
}

/** The items the POS lists: its profile's choice, else the POS preference; ERPNext profiles have none. */
export function getItemVisibility(profile?: POSProfile | null): ItemVisibility {
  return (profile?.item_visibility ??
    getPOSPreference('item_visibility')) as ItemVisibility;
}

/** Warns of POS settings that a sale needs; the profile's warehouse stands in for POS Settings', as on the server. ERPNext checks its POS Profile itself. */
export function validateIsPosSettingsSet(profile?: POSProfile | null) {
  if (isAccessoryMode()) {
    return;
  }

  try {
    const warehouse = profile?.warehouse || fyo.singles.POSSettings?.warehouse;
    if (!warehouse) {
      throw new ValidationError(
        t`POS Warehouse is not set. Please set it on POS Settings`
      );
    }

    const cashAccount = fyo.singles.POSSettings?.cash_account;
    if (!cashAccount) {
      throw new ValidationError(
        t`POS Counter Cash Account is not set. Please set it on POS Settings`
      );
    }

    const writeOffAccount = fyo.singles.POSSettings?.write_off_account;
    if (!writeOffAccount) {
      throw new ValidationError(
        t`POS Write Off Account is not set. Please set it on POS Settings`
      );
    }
  } catch (error) {
    showToast({
      type: 'error',
      message: t`${error as string}`,
      duration: 'long',
    });
  }
}
