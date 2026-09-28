export type DocPermission =
  | 'read'
  | 'write'
  | 'create'
  | 'delete'
  | 'submit'
  | 'cancel'
  | 'print'
  | 'export'
  | 'import';

/** Frappe's rights on one document, as `frappe.client.get_doc_permissions` returns them. */
export type DocPermissionMap = Partial<Record<DocPermission, number>>;

/** The doctypes the user has each right on, as `frappe.boot.user` lists them. */
export type BootUserPermissions = Partial<
  Record<`can_${DocPermission}` | 'can_export_owner_only', string[]>
> & { roles?: string[] };

export type Permissions = {
  /** DocType name by schema name. */
  doctypes: Record<string, string | undefined>;
  user: BootUserPermissions;
};

/** Without boot permissions (tests and scripts), nothing is restricted. */
export function hasPermission(
  permissions: Permissions | null,
  schemaName: string,
  permission: DocPermission
): boolean {
  if (!permissions) {
    return true;
  }

  // Frappe lets a System Manager export every doctype.
  if (
    permission === 'export' &&
    permissions.user.roles?.includes('System Manager')
  ) {
    return true;
  }

  const doctype = permissions.doctypes[schemaName];
  return !!doctype && !!permissions.user[`can_${permission}`]?.includes(doctype);
}

/** Frappe exports only the user's own documents when export is granted only to owners. */
export function exportsOwnDocumentsOnly(
  permissions: Permissions | null,
  schemaName: string
): boolean {
  const doctype = permissions?.doctypes[schemaName];
  return !!doctype && !!permissions?.user.can_export_owner_only?.includes(doctype);
}
