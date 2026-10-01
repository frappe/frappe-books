import { t } from 'fyo';
import { ValidationError } from 'fyo/utils/errors';
import { POSProfile } from 'models/baseModels/POSProfile/PosProfile';
import { POSClosingShift } from 'models/inventory/Point of Sale/POSClosingShift';
import { POSOpeningShift } from 'models/inventory/Point of Sale/POSOpeningShift';
import { ModelNameEnum } from 'models/types';
import { ItemVisibility } from 'src/components/POS/types';
import { getAllDocuments } from 'src/frappe/api';
import { getFrappeDoc, newFrappeDoc } from 'src/frappe/documents';
import { fyo } from 'src/initFyo';
import { call } from 'src/web/api';
import { showToast } from './interactive';

const GET_OPEN_SHIFT =
  'frappe_books.frappe_books.doctype.books_pos_opening_shift.books_pos_opening_shift.get_open_shift';

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

/** The name of the open POS shift, if there is one. */
export async function getOpenPOSShift(): Promise<string | null> {
  return await call<string | null>(GET_OPEN_SHIFT);
}

/** The open POS shift, or a new one to open. */
export async function getPOSOpeningShiftDoc(): Promise<POSOpeningShift> {
  const openShift = await getOpenPOSShift();
  if (!openShift) {
    return newFrappeDoc(ModelNameEnum.POSOpeningShift) as POSOpeningShift;
  }

  return (await getFrappeDoc(
    ModelNameEnum.POSOpeningShift,
    openShift
  )) as POSOpeningShift;
}

/** Cash-type payment methods, whose amounts the counted denominations cover. */
export async function getCashPaymentMethods(): Promise<string[]> {
  const methods = await getAllDocuments('Books Payment Method', {
    fields: ['name'],
    filters: [['type', '=', 'Cash']],
  });
  return methods.map(({ name }) => name as string);
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
      message: t`${error as string}`,
      duration: 'long',
    });
  }
}

export function validateClosingAmounts(posShiftDoc: POSClosingShift) {
  if (!posShiftDoc) {
    throw new ValidationError(`POS Shift Document not loaded. Please reload.`);
  }

  posShiftDoc.closing_amounts?.forEach((row) => {
    if (row.closing_amount?.isNegative()) {
      throw new ValidationError(
        t`Closing ${row.payment_method as string} Amount can not be negative.`
      );
    }
  });
}
