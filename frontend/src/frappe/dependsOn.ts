/** Values as Frappe's form scripts see them: raw values, and `__islocal` on a new document. */
export type EvalDoc = Record<string, unknown>;

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
    return !!evaluate(condition.slice(5), doc, parent ?? {});
  }

  return hasValue(doc[condition]);
}

function evaluate(expression: string, doc: EvalDoc, parent: EvalDoc): unknown {
  // Conditions come from DocType meta, which only administrators change.
  const run = new Function('doc', 'parent', `return (${expression});`) as (
    doc: EvalDoc,
    parent: EvalDoc
  ) => unknown;
  return run(doc, parent);
}

function hasValue(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : !!value;
}
