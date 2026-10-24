import { t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import { POSProfile } from 'models/baseModels/POSProfile/PosProfile';
import { ModelNameEnum } from 'models/types';
import { ItemVisibility } from 'src/components/POS/types';
import { getFrappeDoc } from 'src/frappe/documents';
import { fyo } from 'src/initFyo';
import { showToast } from './interactive';

export type POSPermissions = {
  canChangeRate: boolean;
  canEditDiscount: boolean;
};

/** The POS profile that POS Settings names, if any. */
export async function getPOSProfile(): Promise<POSProfile | undefined> {
  const name = fyo.singles.POSSettings?.pos_profile;
  if (!name) {
    return undefined;
  }

  return (await getFrappeDoc(ModelNameEnum.POSProfile, name)) as POSProfile;
}

/** What the POS profile in use, else POS Settings, lets the cashier change. */
export async function getPOSPermissions(): Promise<POSPermissions> {
  const source = (await getPOSProfile()) ?? fyo.singles.POSSettings;
  return {
    canChangeRate: !!source?.allow_rate_change,
    canEditDiscount: !!source?.allow_discount_change,
  };
}

/** The items the POS lists: its profile's choice, else POS Settings'. */
export async function getItemVisibility(): Promise<ItemVisibility> {
  const profile = await getPOSProfile();
  return (profile?.item_visibility ??
    fyo.singles.POSSettings?.item_visibility) as ItemVisibility;
}

/** Warns of POS settings that a sale needs; the profile's warehouse stands in for POS Settings', as on the server. */
export function validateIsPosSettingsSet(profile?: POSProfile | null) {
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
