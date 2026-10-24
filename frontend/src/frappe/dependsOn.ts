/** Values as Frappe's form scripts see them: raw values, and `__islocal` on a new document. */
export type EvalDoc = Record<string, unknown>;

type Expression = (
  doc: EvalDoc,
  parent: EvalDoc,
  ...globals: unknown[]
) => unknown;

/** Frappe's form globals that conditions call. */
const GLOBALS = {
  in_list: (list: unknown[] | undefined, item: unknown) =>
    !!list?.includes(item),
  flt: (value: unknown) => parseFloat(String(value)) || 0,
  cint: (value: unknown) => parseInt(String(value)) || 0,
};

const expressions = new Map<string, Expression>();
const failed = new Set<string>();
// Desk's form globals, which only its form scripts have.
const DESK_GLOBALS =
  /\b(erpnext|frappe|cur_frm|cur_list|locals|moment)\s*[.([]/;

/**
 * Evaluates a DocField condition (depends_on and the like) the way Frappe's
 * form does: `eval:<expression>` over `doc` and `parent`, or a fieldname
 * whose value must be set. Only decides what the form shows; the server
 * enforces its own rules. A condition that needs Desk's form scripts, like
 * `erpnext.*` or `frappe.boot.*`, is `unknown`, and is logged once.
 */
export function evaluateCondition(
  condition: string | undefined,
  doc: EvalDoc,
  parent?: EvalDoc,
  unknown = true
): boolean {
  if (!condition) {
    return true;
  }

  if (condition.startsWith('eval:')) {
    return evaluate(condition.slice(5), doc, parent ?? {}) ?? unknown;
  }

  return hasValue(doc[condition]);
}

/** An expression's truth, or undefined when it needs Desk's form scripts or fails. */
function evaluate(
  source: string,
  doc: EvalDoc,
  parent: EvalDoc
): boolean | undefined {
  if (DESK_GLOBALS.test(source)) {
    warnOnce(source);
    return undefined;
  }

  try {
    return !!getExpression(source)(doc, parent, ...Object.values(GLOBALS));
  } catch (error) {
    warnOnce(source, error);
    return undefined;
  }
}

function warnOnce(source: string, error?: unknown) {
  if (!failed.has(source)) {
    failed.add(source);
    // A warning, not an error: the form works, it only shows the field.
    // eslint-disable-next-line no-console
    console.warn(
      `Not evaluated, as it needs Desk's scripts: ${source}`,
      error ?? ''
    );
  }
}

/** An expression compiled once, as forms evaluate it on every render. */
function getExpression(source: string): Expression {
  let expression = expressions.get(source);
  if (!expression) {
    // Conditions come from DocType meta, which only administrators change.
    // Desk takes a statement, so a trailing semicolon is allowed.
    const body = source.trim().replace(/;+$/, '');
    expression = new Function(
      'doc',
      'parent',
      ...Object.keys(GLOBALS),
      `return (${body});`
    ) as Expression;
    expressions.set(source, expression);
  }

  return expression;
}

function hasValue(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : !!value;
}
