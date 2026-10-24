import { t } from 'fyo';
import { ModelNameEnum } from 'models/types';
import { isAccessoryMode } from 'src/frappe/mode';
import { fyo } from 'src/initFyo';
import { onMounted, onUnmounted, ref } from 'vue';

/** Company name, logo and second line shown at the top of the sidebar: the user, or ERPNext in accessory mode. */
export function useCompanyIdentity() {
  const companyName = ref('');
  const companyLogo = ref('');
  const user = window.frappe.boot?.user?.name ?? '';
  const userName = window.frappe.boot?.user_info?.[user]?.fullname ?? user;
  const subtitle = isAccessoryMode() ? t`ERPNext` : userName;
  const printSettingsSync = `sync:${ModelNameEnum.PrintSettings}`;

  function setCompanyLogo() {
    companyLogo.value = fyo.singles.PrintSettings?.logo ?? '';
  }

  onMounted(() => {
    companyName.value = fyo.singles.Company?.company_name ?? '';
    setCompanyLogo();
    fyo.observer.on(printSettingsSync, setCompanyLogo);
  });
  onUnmounted(() => fyo.observer.off(printSettingsSync, setCompanyLogo));

  return { companyName, companyLogo, subtitle };
}
