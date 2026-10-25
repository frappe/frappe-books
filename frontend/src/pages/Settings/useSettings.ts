import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import type { FrappeDoc } from 'src/frappe/document';
import { ModelNameEnum } from 'models/types';
import { Field, Schema } from 'schemas/types';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getERPNextLogo, isAccessoryMode } from 'src/frappe/mode';
import { getFields, getSchema } from 'src/frappe/registry';
import { fyo } from 'src/initFyo';
import { getErrorMessage } from 'src/utils';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { showDialog } from 'src/utils/interactive';
import { UIGroupedFields } from 'src/utils/types';
import { computed, inject, ref, shallowRef } from 'vue';

const SETTINGS_SCHEMAS = [
  ModelNameEnum.AccountingSettings,
  ModelNameEnum.Company,
  ModelNameEnum.InventorySettings,
  ModelNameEnum.Defaults,
  ModelNameEnum.POSSettings,
  ModelNameEnum.PrintSettings,
  ModelNameEnum.SystemSettings,
];
const SHORTCUT_CONTEXT = 'Settings';
export const ERPNEXT_TAB = 'ERPNext';
const POS_SCREEN_TAB = 'POSScreen';

export interface SettingsTab {
  value: string;
  label: string;
  icon: string;
}

/** The ERPNext section's tab: for those who can change it, with ERPNext installed. */
export function getERPNextTab(): SettingsTab | null {
  const hasERPNext = !!window.frappe.boot?.books?.erpnext;
  if (!hasERPNext || !fyo.singles.ERPNextSettings) {
    return null;
  }

  if (!fyo.can(ModelNameEnum.ERPNextSettings, 'write')) {
    return null;
  }

  return { value: ERPNEXT_TAB, label: t`ERPNext`, icon: getERPNextLogo() };
}

/** Accessory mode: the POS screen preferences' tab, named as standalone's POS tab. */
export function getPOSScreenTab(): SettingsTab | null {
  if (!getPOSScreenDocs().length) {
    return null;
  }

  return {
    value: POS_SCREEN_TAB,
    label: t`POS Settings`,
    icon: 'lucide-store',
  };
}

/** A titled group of a single's fields, like the POS screen's button colours. */
export interface SettingsGroup {
  title: string;
  doc: FrappeDoc;
  fields: Field[];
}

// The POS screen preferences accessory mode's POS tab shows, as the standalone tabs hold them.
const POS_SCREEN_GROUPS: [string, ModelNameEnum, string[]][] = [
  [
    t`Button colours`,
    ModelNameEnum.POSScreenDefaults,
    ['save', 'cancel', 'held', 'return', 'pay'].map(
      (a) => `${a}_button_colour`
    ),
  ],
  [
    t`Cash denominations`,
    ModelNameEnum.POSScreenDefaults,
    ['pos_cash_denominations'],
  ],
  [t`Item grid`, ModelNameEnum.POSScreenSettings, ['pos_ui']],
  [t`Item visibility`, ModelNameEnum.POSScreenSettings, ['item_visibility']],
  [
    t`Scale barcodes`,
    ModelNameEnum.POSScreenSettings,
    [
      'weight_enabled_barcode',
      'check_digits',
      'item_code_digits',
      'item_weight_digits',
    ],
  ],
];

/** Accessory mode: the POS screen preferences, which only System Managers change. */
function getPOSScreenDocs(): FrappeDoc[] {
  const roles = window.frappe.boot?.user?.roles ?? [];
  if (!isAccessoryMode() || !roles.includes('System Manager')) {
    return [];
  }

  return [ModelNameEnum.POSScreenSettings, ModelNameEnum.POSScreenDefaults]
    .map((name) => fyo.singles[name])
    .filter((doc): doc is FrappeDoc => !!doc?.canWrite);
}

/** The settings singles and the one company as tabs of sections, saved together. */
export function useSettings() {
  const shortcuts = inject(shortcutsKey);
  const errors = ref<Record<string, string>>({});
  const groupedFields = shallowRef<UIGroupedFields>(new Map());
  const schemas = computed(() =>
    SETTINGS_SCHEMAS.filter(isEnabled).map((name) => getSchema(name)!)
  );
  const tabs = computed(() =>
    schemas.value.map(({ name }) => getTab(name as ModelNameEnum))
  );
  const posScreenGroups = shallowRef<SettingsGroup[]>([]);
  const canSave = computed(() =>
    [...SETTINGS_SCHEMAS, ...POS_SCREEN_SCHEMAS].some(
      (name) => fyo.singles[name]?.canSave
    )
  );

  function update() {
    groupedFields.value = groupFields(schemas.value);
    posScreenGroups.value = getPOSScreenGroups();
  }

  function getDocs(): FrappeDoc[] {
    const docs = schemas.value
      .map(({ name }) => fyo.singles[name])
      .filter((doc): doc is FrappeDoc => !!doc);
    return [...docs, ...getPOSScreenDocs()];
  }

  async function onValueChange(doc: FrappeDoc, field: Field, value: DocValue) {
    const { fieldname } = field;
    delete errors.value[fieldname];

    try {
      await doc.set(fieldname, value ?? '');
    } catch (err) {
      if (!(err instanceof Error)) {
        return;
      }

      errors.value[fieldname] = getErrorMessage(err, doc);
    }

    update();
  }

  async function syncDoc(doc: FrappeDoc): Promise<boolean> {
    try {
      await doc.sync();
    } catch (error) {
      await handleErrorWithDialog(error, doc, true);
      return false;
    }

    try {
      update();
    } catch (error) {
      fyo.reportDocumentActionWarning(doc, 'save', [error]);
    }
    return true;
  }

  async function sync(): Promise<void> {
    for (const doc of getDocs().filter((doc) => doc.canSave)) {
      if (!(await syncDoc(doc))) {
        return;
      }
    }

    await showDialog({
      title: t`Reload Frappe Books?`,
      detail: t`Changes made to settings will be visible on reload.`,
      type: 'info',
      buttons: [
        {
          label: t`Yes`,
          isPrimary: true,
          action: () => window.location.reload(),
        },
        { label: t`No`, action: () => null, isEscape: true },
      ],
    });
  }

  /** Drops unsaved changes. */
  async function reset() {
    for (const doc of getDocs().filter((doc) => doc.dirty)) {
      await doc.load();
    }

    update();
  }

  function setSaveShortcut() {
    shortcuts?.pmod.set(SHORTCUT_CONTEXT, ['KeyS'], async () => {
      if (canSave.value) {
        await sync();
      }
    });
  }

  function deleteSaveShortcut() {
    shortcuts?.delete(SHORTCUT_CONTEXT);
  }

  update();
  return {
    errors,
    groupedFields,
    posScreenGroups,
    tabs,
    canSave,
    onValueChange,
    sync,
    reset,
    setSaveShortcut,
    deleteSaveShortcut,
  };
}

const POS_SCREEN_SCHEMAS = [
  ModelNameEnum.POSScreenSettings,
  ModelNameEnum.POSScreenDefaults,
];

/** The POS screen groups' fields that show now, e.g. digits once scale barcodes are on. */
function getPOSScreenGroups(): SettingsGroup[] {
  const docs = getPOSScreenDocs();
  return POS_SCREEN_GROUPS.map(([title, schemaName, fieldnames]) => {
    const doc = docs.find((doc) => doc.schemaName === schemaName);
    const fields = (doc ? getFields(schemaName, fieldnames) : []).filter(
      (field) => !doc!.getFieldState(field).hidden
    );
    return { title, doc: doc!, fields };
  }).filter(({ fields }) => fields.length);
}

/** Accessory mode keeps the settings of the UI only; ERPNext holds the rest. */
const ACCESSORY_SETTINGS_SCHEMAS = [
  ModelNameEnum.PrintSettings,
  ModelNameEnum.SystemSettings,
];

function isEnabled(name: ModelNameEnum): boolean {
  if (isAccessoryMode()) {
    return ACCESSORY_SETTINGS_SCHEMAS.includes(name);
  }

  // The setup wizard makes the company.
  if (name === ModelNameEnum.Company) {
    return !!fyo.singles.Company;
  }

  if (name === ModelNameEnum.InventorySettings) {
    return fyo.isFeatureOn('enable_inventory');
  }

  if (name === ModelNameEnum.POSSettings) {
    return fyo.isFeatureOn('enable_point_of_sale');
  }

  return true;
}

function getTab(name: ModelNameEnum): SettingsTab {
  const tabs: Partial<Record<ModelNameEnum, [string, string]>> = {
    [ModelNameEnum.AccountingSettings]: [t`General`, 'lucide-building-2'],
    [ModelNameEnum.Company]: [t`Company`, 'lucide-landmark'],
    [ModelNameEnum.InventorySettings]: [t`Inventory`, 'lucide-package'],
    [ModelNameEnum.Defaults]: [t`Defaults`, 'lucide-file-cog'],
    [ModelNameEnum.POSSettings]: [t`POS Settings`, 'lucide-store'],
    [ModelNameEnum.PrintSettings]: [t`Print`, 'lucide-printer'],
    [ModelNameEnum.SystemSettings]: [t`System`, 'lucide-monitor-cog'],
  };
  const [label, icon] = tabs[name] ?? [name, 'lucide-settings'];
  return { value: name, label, icon };
}

/** Each schema's visible fields by section; a schema is a tab. */
function groupFields(schemas: Schema[]): UIGroupedFields {
  const grouped: UIGroupedFields = new Map();
  for (const field of schemas.flatMap((schema) => schema.fields)) {
    const schemaName = field.schemaName!;
    if (!grouped.has(schemaName)) {
      grouped.set(schemaName, new Map());
    }

    const tabbed = grouped.get(schemaName)!;
    const section = field.section ?? t`Miscellaneous`;
    if (!tabbed.has(section)) {
      tabbed.set(section, []);
    }

    const doc = fyo.singles[schemaName];
    if (field.meta || !doc || doc.getFieldState(field).hidden) {
      continue;
    }

    tabbed.get(section)!.push(field);
  }

  return grouped;
}
