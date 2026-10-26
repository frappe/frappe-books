/**
 * The link queries /books gets from apps' Desk JS: each form's `set_query`
 * rules, as rules of the document's values (`eval:doc.x`, `eval:parent.x`).
 *
 * A rule is kept only when it gives what Desk's gives on every sample of the
 * document: all fields set, none set, and, from all set, each field it reads
 * cleared or set to each value Desk JS compares it with, alone and in pairs.
 * A rule that branches on the values otherwise is left out, so /books searches
 * the field without it.
 *
 * Run as `node generate.mjs < input.json`: reads `{ bundles, forms, metas,
 * boot, responses }` (the apps' `app_include_js` code, each form's `__js`,
 * DocType metas, `frappe.boot`, and messages of methods the forms call) and
 * writes `{ queries, skipped }` by doctype.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createDesk } from './desk.mjs';

const TABLE_TYPES = ['Table', 'Table MultiSelect'];
const LINK_TYPES = ['Link', 'Dynamic Link'];
const NO_VALUE_TYPES = [
  'Section Break',
  'Column Break',
  'Tab Break',
  'HTML',
  'Button',
  'Heading',
  'Fold',
  'Image',
];
const NUMBER_TYPES = ['Check', 'Int', 'Float', 'Currency', 'Percent'];
// Fields a form's document keeps, so samples do not vary them.
const FIXED_FIELDS = [
  'doctype',
  'name',
  'docstatus',
  'idx',
  'parent',
  'parenttype',
  'parentfield',
];
const TOKEN = /^([PR])\.(\w+)$/;
const MAX_PAIRS = 400;

const SAMPLE_COMPANY = {
  doctype: ':Company',
  name: 'P.company',
  default_currency: '@company_currency',
};
// Values of `frappe` the forms read; a token stands for one /books cannot know.
const STUBS = {
  defaults: {
    get_user_default: (key) => `@user_default(${key})`,
    get_default: (key) => `@default(${key})`,
  },
  datetime: {
    get_today: () => '@today',
    nowdate: () => '@today',
    now_time: () => '@now_time',
    add_months: (date, months) => `@add_months(${date}, ${months})`,
    add_days: (date, days) => `@add_days(${date}, ${days})`,
  },
};

export async function generate({
  bundles,
  forms,
  metas,
  boot,
  responses = {},
}) {
  const generator = new Generator({ bundles, forms, metas, boot, responses });
  const queries = {};
  const skipped = {};
  for (const [doctype, code] of Object.entries(forms)) {
    const found = await generator.generateForm(doctype, code);
    if (Object.keys(found.queries).length) queries[doctype] = found.queries;
    if (found.skipped.length) skipped[doctype] = found.skipped;
  }
  return { queries, skipped };
}

export class Generator {
  constructor({ bundles, forms, metas, boot, responses }) {
    this.metas = new Map(Object.entries(metas));
    this.literals = collectLiterals([...bundles, ...Object.values(forms)]);
    this.deskOptions = {
      bundles,
      metas: this.metas,
      boot: { ...boot, docs: [...(boot.docs ?? []), SAMPLE_COMPANY] },
      responses: Object.fromEntries(
        Object.entries(responses).map(([method, message]) => [
          method,
          () => message,
        ])
      ),
      stubs: STUBS,
    };
  }

  /** The kept rules of a form, and the keys of the ones left out. */
  async generateForm(doctype, code) {
    const forms = [];
    for (const empty of [false, true]) {
      const doc = this.makeSample(doctype, 'P', empty);
      const desk = createDesk(this.deskOptions);
      forms.push({
        desk,
        doc,
        empty,
        ...(await desk.openForm(doctype, code, doc)),
      });
    }

    const queries = {};
    const skipped = [];
    const keys = new Set(forms.flatMap((form) => [...form.queries.keys()]));
    for (const key of [...keys].filter((key) =>
      this.isLinkField(doctype, key)
    )) {
      const rule = this.findRule(doctype, key, forms);
      if (rule) queries[key] = rule;
      else skipped.push(key);
    }
    return { queries, skipped };
  }

  /** A rule that gives Desk's results for `key` on every sample, or undefined. */
  findRule(doctype, key, [full, empty]) {
    const child = this.getChild(doctype, key);
    if (!full.queries.has(key)) return;
    if (!empty.queries.has(key) && !this.isHiddenWhenOff(doctype, key)) return;

    const row = child && this.makeSample(child, 'R');
    const base = this.run(full, key, full.doc, row);
    if (base.result === undefined) return;

    // A form that set no rule hides the field, so only the others are samples.
    const forms = [full, empty].filter((form) => form.queries.has(key));
    const samples = this.getSamples(doctype, child, forms, base.reads);
    const guards = this.getGuards(full, key, row, base);
    for (const rule of getCandidates(base.value, !!child, guards)) {
      if (samples.every((sample) => this.agrees(rule, key, sample)))
        return rule;
    }
  }

  /** Whether `rule` gives what Desk gives on `sample`; Desk throwing there leaves it free. */
  agrees(rule, key, { form, parent, row }) {
    const { result } = this.run(form, key, parent, row);
    return (
      result === undefined || result === normalize(predict(rule, parent, row))
    );
  }

  /**
   * Samples for a rule: on both base documents, a set and a blank row; from
   * the all-set one, each field it read cleared or set to each value Desk JS
   * compares it with, and pairs of those values.
   */
  getSamples(doctype, child, forms, reads) {
    const rows = child
      ? [this.makeSample(child, 'R'), this.makeSample(child, 'R', true)]
      : [undefined];
    const samples = forms.flatMap((form) =>
      rows.map((row) => ({ form, parent: form.doc, row }))
    );

    const [full] = forms;
    const fullRow = rows[0];
    const variants = [
      ...[...reads.parent].map((fieldname) => [
        'parent',
        fieldname,
        this.getValues(doctype, fieldname),
      ]),
      ...[...reads.row].map((fieldname) => [
        'row',
        fieldname,
        this.getValues(child, fieldname),
      ]),
    ].filter(
      ([, fieldname, values]) => values && !FIXED_FIELDS.includes(fieldname)
    );

    const sample = (changes) => {
      const parent = { ...full.doc };
      const row = fullRow && { ...fullRow };
      for (const [side, fieldname, value] of changes) {
        (side === 'row' ? row : parent)[fieldname] = value;
      }
      return { form: full, parent, row };
    };
    for (const [side, fieldname, values] of variants) {
      for (const value of [undefined, ...values])
        samples.push(sample([[side, fieldname, value]]));
    }

    const compared = variants.filter(([, , values]) => values.length);
    let pairs = 0;
    for (const [index, [sideA, fieldA, valuesA]] of compared.entries()) {
      for (const [sideB, fieldB, valuesB] of compared.slice(index + 1)) {
        for (const a of valuesA) {
          for (const b of valuesB) {
            if (++pairs > MAX_PAIRS) return samples;
            samples.push(
              sample([
                [sideA, fieldA, a],
                [sideB, fieldB, b],
              ])
            );
          }
        }
      }
    }
    return samples;
  }

  /** Fields the rule needs set: clearing one leaves Desk with no query at all. */
  getGuards(full, key, row, base) {
    const guards = [];
    for (const side of ['parent', 'row']) {
      for (const fieldname of base.reads[side]) {
        if (FIXED_FIELDS.includes(fieldname)) continue;
        const parent = { ...full.doc };
        const sampleRow = row && { ...row };
        delete (side === 'row' ? sampleRow : parent)[fieldname];
        if (this.run(full, key, parent, sampleRow).result === normalize({})) {
          guards.push(
            `eval:${side === 'row' || !row ? 'doc' : 'parent'}.${fieldname}`
          );
        }
      }
    }
    return guards;
  }

  /**
   * Desk's search for `key` on a form with `parent` (and `row`) as its values:
   * `result` normalized (undefined when Desk throws), `value` as returned,
   * and the fields the rule read.
   */
  run(form, key, parent, row) {
    const reads = { parent: new Set(), row: new Set() };
    const parentDoc = track(parent, reads.parent);
    const rowDoc = row && track(row, reads.row);
    const { desk, frm, queries, doc } = form;
    const getQuery = queries.get(key);
    frm.doc = parentDoc;
    desk.locals[frm.doctype] = { [parent.name]: parentDoc };
    if (row) desk.locals[row.doctype] = { [row.name]: rowDoc };
    desk.thrown.length = 0;
    try {
      const found =
        typeof getQuery === 'function'
          ? getQuery(
              parentDoc,
              (row ?? parent).doctype,
              (row ?? parent).name,
              frm
            )
          : fromObject(getQuery);
      const value =
        typeof found === 'string' ? { query: found } : (found ?? {});
      if (desk.thrown.length) return { reads };
      return { value, result: normalize(value), reads };
    } catch {
      return { reads };
    } finally {
      frm.doc = doc;
      desk.locals[frm.doctype] = { [doc.name]: doc };
    }
  }

  /** Values Desk JS compares the field with, and a Select's options; null for a field the doctype lacks. */
  getValues(doctype, fieldname) {
    const df = this.getField(doctype, fieldname);
    if (!df || NO_VALUE_TYPES.includes(df.fieldtype)) return null;
    const values = new Set(this.literals.get(fieldname));
    if (df.fieldtype === 'Select') {
      for (const option of (df.options ?? '').split('\n')) values.add(option);
    }
    if (df.fieldtype === 'Check') [0, 1].forEach((value) => values.add(value));
    return [...values];
  }

  /** A document of `doctype` with every field set (`P.<fieldname>`, 1 for numbers), or blank. */
  makeSample(doctype, prefix, empty = false) {
    const doc = { doctype, name: `${prefix}.name`, docstatus: 0 };
    for (const df of this.metas.get(doctype)?.fields ?? []) {
      if (TABLE_TYPES.includes(df.fieldtype)) {
        // A row of every table, its values unknown to the rule's document
        doc[df.fieldname] =
          empty || !this.metas.has(df.options)
            ? []
            : [this.makeSample(df.options, 'T')];
      } else if (NUMBER_TYPES.includes(df.fieldtype)) {
        doc[df.fieldname] = empty ? 0 : 1;
      } else if (!empty && !NO_VALUE_TYPES.includes(df.fieldtype)) {
        doc[df.fieldname] = `${prefix}.${df.fieldname}`;
      }
    }
    return doc;
  }

  isLinkField(doctype, key) {
    const [table, fieldname] = key.includes('.') ? key.split('.') : [null, key];
    const df = this.getField(
      table ? this.getChild(doctype, key) : doctype,
      fieldname
    );
    return !!df && LINK_TYPES.includes(df.fieldtype);
  }

  /** Whether Desk hides the field when the rule is not set: its, or its table's, depends_on. */
  isHiddenWhenOff(doctype, key) {
    const [table, fieldname] = key.includes('.') ? key.split('.') : [null, key];
    const df = this.getField(
      table ? this.getChild(doctype, key) : doctype,
      fieldname
    );
    return !!(
      df?.depends_on ||
      (table && this.getField(doctype, table)?.depends_on)
    );
  }

  getChild(doctype, key) {
    const [table, fieldname] = key.split('.');
    return fieldname ? this.getField(doctype, table)?.options : undefined;
  }

  getField(doctype, fieldname) {
    return this.metas
      .get(doctype)
      ?.fields.find((df) => df.fieldname === fieldname);
  }
}

/**
 * Rules that may stand for Desk's `value` on the all-set sample: its tokens as
 * the fields they name, then with a Check's 1 as the Check, each with and
 * without `guards`. None when it holds a value /books cannot work out.
 */
function getCandidates(value, isRow, guards) {
  const rules = [
    toRule(value, isRow, false),
    toRule(value, isRow, true),
  ].filter(Boolean);
  const distinct = [
    ...new Map(rules.map((rule) => [JSON.stringify(rule), rule])).values(),
  ];
  return distinct.flatMap((rule) =>
    guards.length ? [rule, { ...rule, when: guards }] : [rule]
  );
}

function toRule({ query, filters, ...rest }, isRow, checks) {
  if (Object.keys(rest).some((key) => rest[key] !== undefined)) return;
  if (query !== undefined && typeof query !== 'string') return;
  const side = { P: isRow ? 'parent' : 'doc', R: 'doc' };
  let convertible = true;
  const convert = (value, key) => {
    if (typeof value === 'string') {
      const match = value.match(TOKEN);
      if (match) return `eval:${side[match[1]]}.${match[2]}`;
      if (/(^|\W)[PRT]\.\w+|^@/.test(value)) convertible = false;
      return value;
    }
    if (checks && value === 1 && key) return `eval:doc.${key}`;
    if (Array.isArray(value)) return value.map((item) => convert(item));
    if (value && typeof value === 'object') {
      // An object of the sandbox's realm, so its prototype is not this one's
      const proto = Object.getPrototypeOf(value);
      if (proto && Object.getPrototypeOf(proto) !== null) convertible = false;
      return Object.fromEntries(
        Object.entries(value).map(([k, item]) => [k, convert(item, k)])
      );
    }
    if (typeof value === 'function') convertible = false;
    return value;
  };
  const rule = {};
  if (query) rule.query = query;
  if (filters)
    rule.filters = Array.isArray(filters)
      ? filters.map((filter) => convert(filter))
      : convert(filters);
  return convertible ? rule : undefined;
}

/** What /books' search would be from `rule` on these values, as Desk's link control takes it. */
function predict(rule, parent, row) {
  const context = { doc: row ?? parent, parent: row ? parent : null };
  const resolve = (value) => {
    if (typeof value === 'string' && value.startsWith('eval:')) {
      const [side, fieldname] = value.slice(5).split('.');
      return context[side]?.[fieldname];
    }
    if (Array.isArray(value)) return value.map(resolve);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, resolve(item)])
      );
    }
    return value;
  };
  if (rule.when?.some((guard) => !resolve(guard))) return {};
  return { query: rule.query, filters: resolve(rule.filters) };
}

/** Desk's search args from a rule: `{ query, filters }`, empty values of a dict left out, as `set_nulls` does. */
export function normalize({ query, filters, ...rest }) {
  const kept = Array.isArray(filters)
    ? blankAsNull(filters)
    : filters &&
      Object.fromEntries(
        Object.entries(filters).filter(
          ([, value]) => ![undefined, null, ''].includes(value)
        )
      );
  const isEmpty = !kept || !Object.keys(kept).length;
  return canonical({
    query: query || undefined,
    filters: isEmpty ? undefined : kept,
    ...rest,
  });
}

/** A list filter's blank values as null: Desk's searches take "" and null alike. */
function blankAsNull(value) {
  if (Array.isArray(value)) return value.map(blankAsNull);
  return value === '' || value === undefined ? null : value;
}

/** JSON with sorted keys; a function (a value Desk works out at runtime) shows as such. */
function canonical(value) {
  return JSON.stringify(value, (_, item) => {
    if (typeof item === 'function') return '<computed>';
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.entries(item).sort(([a], [b]) => a.localeCompare(b))
      );
    }
    return item;
  });
}

/** A `set_query(field, { filters })` object, or bare filters, as Desk's link control reads them. */
function fromObject(getQuery) {
  return getQuery?.filters || !getQuery?.query
    ? { filters: getQuery?.filters ?? getQuery }
    : { query: getQuery.query };
}

/** `doc`, recording the fieldnames read from it. */
function track(doc, reads) {
  return new Proxy(doc, {
    get(target, key) {
      if (typeof key === 'string') reads.add(key);
      return target[key];
    },
  });
}

/** The string values Desk JS compares each fieldname with: `x.f == "v"`, `["v"].includes(x.f)`, `in_list(["v"], x.f)`. */
function collectLiterals(codes) {
  const literals = new Map();
  const add = (fieldname, value) =>
    literals.set(
      fieldname,
      new Set([...(literals.get(fieldname) ?? []), value])
    );
  const strings = (list) =>
    [...list.matchAll(/(["'])((?:(?!\1).)*)\1/g)].map((match) => match[2]);
  for (const code of codes) {
    for (const [, fieldname, , value] of code.matchAll(
      /\.(\w+)\s*[!=]==?\s*(["'])((?:(?!\2).)*)\2/g
    )) {
      add(fieldname, value);
    }
    for (const [, , value, fieldname] of code.matchAll(
      /(["'])((?:(?!\1).)*)\1\s*[!=]==?\s*[\w.]*\.(\w+)/g
    )) {
      add(fieldname, value);
    }
    for (const [, list, fieldname] of code.matchAll(
      /\[([^\]]*)\]\s*\.includes\(\s*[\w.]*\.(\w+)\s*\)/g
    )) {
      strings(list).forEach((value) => add(fieldname, value));
    }
    for (const [, list, fieldname] of code.matchAll(
      /in_list\(\s*\[([^\]]*)\]\s*,\s*[\w.]*\.(\w+)\s*\)/g
    )) {
      strings(list).forEach((value) => add(fieldname, value));
    }
  }
  return literals;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Desk JS failing in a callback fails that callback, as in a browser.
  process.on('uncaughtException', () => {});
  process.on('unhandledRejection', () => {});
  const input = JSON.parse(readFileSync(0, 'utf8'));
  process.stdout.write(JSON.stringify(await generate(input)));
  // Desk JS leaves timers and promises of the server pending.
  process.exit(0);
}
