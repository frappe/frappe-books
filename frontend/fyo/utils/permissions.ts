export type DocPermission =
  | 'read'
  | 'write'
  | 'create'
  | 'delete'
  | 'submit'
  | 'cancel';

export type PermissionMap = Record<string, DocPermission[] | undefined>;

/**
 * The server sends the map in the Books boot. Without one (tests and
 * scripts), nothing is restricted.
 */
export function hasPermission(
  permissions: PermissionMap | null,
  schemaName: string,
  permission: DocPermission
): boolean {
  return !permissions || !!permissions[schemaName]?.includes(permission);
}
