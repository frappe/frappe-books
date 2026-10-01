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

  function setCompanyLogo() {
    companyLogo.value = fyo.singles.PrintSettings?.logo ?? '';
  }

  onMounted(() => {
    companyName.value = fyo.singles.AccountingSettings?.company_name ?? '';
    setCompanyLogo();
    fyo.observer.on(printSettingsSync, setCompanyLogo);
  });
  onUnmounted(() => fyo.observer.off(printSettingsSync, setCompanyLogo));

  return { companyName, companyLogo, userName };
}
