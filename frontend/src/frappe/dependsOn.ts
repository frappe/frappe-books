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

/**
 * Evaluates a DocField condition (depends_on and the like) the way Frappe's
 * form does: `eval:<expression>` over `doc` and `parent`, or a fieldname
 * whose value must be set. Only decides what the form shows; the server
 * enforces its own rules.
 */
export function evaluateCondition(
  condition: string | undefined,
  doc: EvalDoc,
  parent?: EvalDoc
): boolean {
  if (!condition) {
    return true;
  }

  if (condition.startsWith('eval:')) {
    return evaluate(condition.slice(5), doc, parent ?? {});
  }

  return hasValue(doc[condition]);
}

/**
 * An expression's truth. One that needs Desk's form scripts, like `erpnext.*`
 * globals, shows the field, and is logged once.
 */
function evaluate(source: string, doc: EvalDoc, parent: EvalDoc): boolean {
  try {
    return !!getExpression(source)(doc, parent, ...Object.values(GLOBALS));
  } catch (error) {
    if (!failed.has(source)) {
      failed.add(source);
      console.error(`Showing a field whose condition failed: ${source}`, error);
    }

    return true;
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
