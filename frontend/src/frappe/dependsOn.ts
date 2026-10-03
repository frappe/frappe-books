/** Values as Frappe's form scripts see them: raw values, and `__islocal` on a new document. */
export type EvalDoc = Record<string, unknown>;

type Expression = (doc: EvalDoc, parent: EvalDoc) => unknown;

const expressions = new Map<string, Expression>();

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
    return !!getExpression(condition.slice(5))(doc, parent ?? {});
  }

  return hasValue(doc[condition]);
}

/** An expression compiled once, as forms evaluate it on every render. */
function getExpression(source: string): Expression {
  let expression = expressions.get(source);
  if (!expression) {
    // Conditions come from DocType meta, which only administrators change.
    expression = new Function(
      'doc',
      'parent',
      `return (${source});`
    ) as Expression;
    expressions.set(source, expression);
  }

  return expression;
}

function hasValue(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : !!value;
}
