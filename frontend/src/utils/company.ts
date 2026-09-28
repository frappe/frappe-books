import { ModelNameEnum } from 'models/types';
import { fyo } from 'src/initFyo';
import { onMounted, onUnmounted, ref } from 'vue';

/** Company name, logo and user shown at the top of the sidebar. */
export function useCompanyIdentity() {
  const companyName = ref('');
  const companyLogo = ref('');
  const user = window.frappe.boot?.user?.name ?? '';
  const userName = window.frappe.boot?.user_info?.[user]?.fullname ?? user;
  const printSettingsSync = `sync:${ModelNameEnum.PrintSettings}`;

  async function setCompanyLogo() {
    // Skipped by the server when the user cannot read Print Settings.
    const [logo] = await fyo.db.getSingleValues({
      fieldname: 'logo',
      parent: ModelNameEnum.PrintSettings,
    });
    companyLogo.value = (logo?.value as string | undefined) ?? '';
  }

  onMounted(async () => {
    const { companyName: name } = await fyo.doc.getDoc(
      ModelNameEnum.AccountingSettings
    );
    companyName.value = name as string;
    await setCompanyLogo();
    fyo.doc.observer.on(printSettingsSync, setCompanyLogo);
  });
  onUnmounted(() => fyo.doc.observer.off(printSettingsSync, setCompanyLogo));

  return { companyName, companyLogo, userName };
}
