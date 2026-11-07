import { t } from 'fyo';
import { getErrorMessage } from 'src/utils';
import { ValidationError } from 'fyo/utils/errors';
import { POSProfile } from 'models/baseModels/POSProfile/PosProfile';
import { ModelNameEnum } from 'models/types';
import type { InjectionKey, Ref } from 'vue';
import { ItemVisibility } from 'src/components/POS/types';
import { getFrappeDoc } from 'src/frappe/documents';
import { fyo } from 'src/initFyo';
import { call } from 'src/web/api';
import { showToast } from './interactive';

export type POSPermissions = {
  canChangeRate: boolean;
  canEditDiscount: boolean;
};

/** What the POS page's profile lets its cart rows change. */
export const posPermissionsKey = Symbol('posPermissions') as InjectionKey<
  Readonly<Ref<POSPermissions>>
>;

const GET_POS_PROFILE =
  'frappe_books.frappe_books.doctype.books_pos_opening_shift.books_pos_opening_shift.get_pos_profile';

/** The name of the POS profile the user's sales use: their shift's, else POS Settings'. */
export async function getPOSProfileName(): Promise<string | null> {
  return await call<string | null>(GET_POS_PROFILE);
}

/** The POS profile the user's sales use. */
export async function getPOSProfile(): Promise<POSProfile | undefined> {
  const name = await getPOSProfileName();
  if (!name) {
    return undefined;
  }

  return (await getFrappeDoc(ModelNameEnum.POSProfile, name)) as POSProfile;
}

/** What the POS profile, else POS Settings, lets the cashier change. */
export function getPOSPermissions(profile?: POSProfile | null): POSPermissions {
  const source = profile ?? fyo.singles.POSSettings;
  return {
    canChangeRate: !!source?.can_change_rate,
    canEditDiscount: !!source?.can_edit_discount,
  };
}

/** The items the POS lists: its profile's choice, else POS Settings'. */
export async function getItemVisibility(): Promise<ItemVisibility> {
  const profile = await getPOSProfile();
  return (profile?.item_visibility ??
    fyo.singles.POSSettings?.item_visibility) as ItemVisibility;
}

/** Warns of POS settings that a sale needs; the profile's inventory stands in for POS Settings', as on the server. */
export function validateIsPosSettingsSet(profile?: POSProfile | null) {
  try {
    const inventory = profile?.inventory || fyo.singles.POSSettings?.inventory;
    if (!inventory) {
      throw new ValidationError(
        t`POS Inventory is not set. Please set it on POS Settings`
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
      message: getErrorMessage(error as Error),
      duration: 'long',
    });
  }
}
