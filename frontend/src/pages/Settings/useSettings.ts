import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import type { FrappeDoc } from 'src/frappe/document';
import { ModelNameEnum } from 'models/types';
import { Field, Schema } from 'schemas/types';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getSchema } from 'src/frappe/registry';
import { fyo } from 'src/initFyo';
import { getErrorMessage } from 'src/utils';
import { evaluateHidden } from 'src/utils/doc';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { showDialog } from 'src/utils/interactive';
import { UIGroupedFields } from 'src/utils/types';
import { computed, inject, ref, shallowRef } from 'vue';

const SETTINGS_SCHEMAS = [
  ModelNameEnum.AccountingSettings,
  ModelNameEnum.InventorySettings,
  ModelNameEnum.Defaults,
  ModelNameEnum.POSSettings,
  ModelNameEnum.PrintSettings,
  ModelNameEnum.SystemSettings,
];
const SHORTCUT_CONTEXT = 'Settings';

export interface SettingsTab {
  value: string;
  label: string;
  icon: string;
}

/** The settings singles as tabs of sections, saved together. */
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
  const canSave = computed(() =>
    SETTINGS_SCHEMAS.some((name) => fyo.singles[name]?.canSave)
  );

  function update() {
    groupedFields.value = groupFields(schemas.value);
  }

  function getDocs(): FrappeDoc[] {
    return schemas.value
      .map(({ name }) => fyo.singles[name])
      .filter((doc): doc is FrappeDoc => !!doc);
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
    tabs,
    canSave,
    onValueChange,
    sync,
    reset,
    setSaveShortcut,
    deleteSaveShortcut,
  };
}

function isEnabled(name: ModelNameEnum): boolean {
  if (name === ModelNameEnum.InventorySettings) {
    return !!fyo.singles.AccountingSettings?.enable_inventory;
  }

  if (name === ModelNameEnum.POSSettings) {
    return !!fyo.singles.InventorySettings?.enable_point_of_sale;
  }

  return true;
}

function getTab(name: ModelNameEnum): SettingsTab {
  const tabs: Partial<Record<ModelNameEnum, [string, string]>> = {
    [ModelNameEnum.AccountingSettings]: [t`General`, 'lucide-building-2'],
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
    if (field.meta || evaluateHidden(field, doc)) {
      continue;
    }

    tabbed.get(section)!.push(field);
  }

  return grouped;
}
