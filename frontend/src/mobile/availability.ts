import type { RouteLocationNormalized } from 'vue-router';

type PhoneRoute = Pick<RouteLocationNormalized, 'meta' | 'params'>;

const desktopOnlySchemas = ['PrintFormat', 'CustomForm'];
const desktopOnlyReports = ['GSTR1', 'GSTR2'];

/** Pages that are left out of the phone layout. */
export function isDesktopOnly(route: PhoneRoute): boolean {
  if (route.meta.desktopOnly) {
    return true;
  }

  const { schemaName, reportClassName } = route.params;
  return (
    desktopOnlySchemas.includes(String(schemaName)) ||
    desktopOnlyReports.includes(String(reportClassName))
  );
}
