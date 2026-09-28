/** Answer every framework call with `respond(method, args)` and record the calls. */
export function stubServer(respond) {
  const calls = [];
  globalThis.window ??= { location: { hostname: 'books.localhost' } };
  globalThis.fetch = async (url, options) => {
    const method = url.replace('/api/method/', '');
    const args = JSON.parse(options.body ?? '{}');
    calls.push({ method, args });
    return Response.json({ message: await respond(method, args) });
  };
  return calls;
}

/** A `frappe.desk.query_report.run` response with columns sized like the server's. */
export function reportResult(columns, result) {
  return {
    columns: columns.map(([fieldname, fieldtype, width]) => ({
      fieldname,
      label: fieldname,
      fieldtype,
      width,
    })),
    result,
  };
}
