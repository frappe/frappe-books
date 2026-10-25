/** Accessory mode: with ERPNext on the site, /books shows ERPNext documents instead of Books ones. */

/** Whether /books shows ERPNext documents; the server's boot falls back to standalone when ERPNext or its company is gone. */
export function isAccessoryMode(): boolean {
  return !!globalThis.window?.frappe?.boot?.books?.accessory_mode;
}

/** The ERPNext company accessory mode works on. */
export function getAccessoryCompany(): string | undefined {
  return globalThis.window?.frappe?.boot?.books?.company ?? undefined;
}

/** Accessory mode: whether ERPNext has companies besides the one Books works on. */
export function hasOtherCompanies(): boolean {
  return !!globalThis.window?.frappe?.boot?.books?.other_companies;
}

/** The DocType a model shows: its Books one, or its ERPNext twin in accessory mode; null when accessory mode leaves it out. */
export function getActiveDoctype(Model: {
  doctype: string;
  erpnextDoctype?: string | null;
}): string | null {
  if (!isAccessoryMode()) {
    return Model.doctype;
  }

  return Model.erpnextDoctype === undefined
    ? toActiveDoctype(Model.doctype)
    : Model.erpnextDoctype;
}

/** A Books doctype a value names, e.g. a party type, as the current mode names it. */
export function toActiveDoctype(booksDoctype: string): string {
  return isAccessoryMode() ? booksDoctype.replace(/^Books /, '') : booksDoctype;
}

/** ERPNext's logo, as its app data in the boot gives it. */
export function getERPNextLogo(): string {
  const erpnext = globalThis.window?.frappe?.boot?.app_data?.find(
    ({ app_name }) => app_name === 'erpnext'
  );
  return erpnext?.app_logo_url ?? '';
}
