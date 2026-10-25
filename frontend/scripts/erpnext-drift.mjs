/**
 * Drift check: Books' copies of ERPNext's Desk rules against ERPNext checkouts.
 *
 *   node scripts/erpnext-drift.mjs <erpnext checkout> <frappe checkout>
 *
 * 1. Link queries: each form of `erpnextQueries.ts` loads as Desk loads it
 *    (scripts/erpnext-desk.mjs); every `set_query` rule runs on sample docs and
 *    must give Books' filters and query method.
 * 2. Report filters: each `reports/erpnext` definition's filters must match its
 *    ERPNext report JS; tokens stand for the values ERPNext works out on load.
 * 3. Methods: every ERPNext method Books calls exists, whitelisted if the
 *    client calls it.
 * 4. Names: every ERPNext doctype and field Books names exists.
 *
 * Prints each difference and exits 1 when there is any.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createDesk } from './erpnext-desk.mjs';

const [erpnextRoot, frappeRoot] = process.argv
  .slice(2)
  .map((dir) => path.resolve(dir));
if (!erpnextRoot || !frappeRoot) {
  console.error(
    'Usage: node scripts/erpnext-drift.mjs <erpnext checkout> <frappe checkout>'
  );
  process.exit(2);
}

const frontend = fileURLToPath(new URL('..', import.meta.url));
const appRoot = path.dirname(frontend);

/** Books doctypes with no ERPNext twin: Books' own settings and standalone-only screens. */
const BOOKS_ONLY = [
  'Accounting Settings',
  'Closing Cash',
  'Custom Field',
  'Custom Form',
  'Default Cash Denominations',
  'Defaults',
  'ERPNext Settings',
  'Field Pick',
  'Field Pick Field',
  'Get Started',
  'Inventory Settings',
  'Item Enquiry',
  'Misc',
  'Number Series',
  'Opening Cash',
  'POS Settings',
  'Print Settings',
  'Realised Tax',
  'Setup Wizard',
  'Stock Entry',
  'Stock Entry Detail',
  'System Settings',
].map((name) => `Books ${name}`);
const STANDARD_FIELDS = [
  'name',
  'owner',
  'creation',
  'modified',
  'modified_by',
  'docstatus',
  'idx',
  'parent',
  'parenttype',
  'parentfield',
];
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
const TABLE_TYPES = ['Table', 'Table MultiSelect'];
const FILTER_KEYS = [
  'fieldtype',
  'options',
  'default',
  'reqd',
  'depends_on',
  'mandatory_depends_on',
];

// The boot both sides read: a company `P.company` (the sample docs' company) and its currency.
const company = {
  doctype: ':Company',
  default_currency: 'INR',
  enable_perpetual_inventory: 1,
};
const boot = {
  docs: [
    { ...company, name: 'P.company' },
    { ...company, name: 'P.name' },
    { doctype: ':Currency', name: 'INR' },
    { doctype: ':Currency', name: 'USD' },
  ],
  party_account_types: {
    Customer: 'Receivable',
    Supplier: 'Payable',
    Employee: 'Payable',
    Shareholder: 'Payable',
  },
  sysdefaults: {
    currency: 'INR',
    default_ageing_range: '@ageing_range',
    disable_include_dimensions: 0,
  },
  user: {
    in_create: [],
    can_create: [],
    can_read: [],
    can_write: [],
    roles: [],
  },
};
// What the report tokens stand for under this boot; the others stand for themselves.
const TOKEN_VALUES = {
  '@include_dimensions': boot.sysdefaults.disable_include_dimensions ? 0 : 1,
};
const deskOptions = {
  erpnext: erpnextRoot,
  boot,
  // What ERPNext's form scripts ask the server for on a fresh site.
  responses: {
    'erpnext.accounts.doctype.accounting_dimension.accounting_dimension.get_dimensions':
      () => [
        [
          { fieldname: 'cost_center', document_type: 'Cost Center' },
          { fieldname: 'project', document_type: 'Project' },
        ],
        {},
      ],
  },
  stubs: {
    defaults: {
      get_user_default: (key) =>
        key === 'Company' ? '@company' : `@user_default(${key})`,
      get_default: (key) =>
        key === 'company' ? '@company' : `@default(${key})`,
    },
    db: {
      get_list: (doctype, { filters } = {}) =>
        doctype === 'Party Type'
          ? Promise.resolve(
              Object.entries(boot.party_account_types)
                .filter(
                  ([, type]) =>
                    !filters?.account_type || type === filters.account_type
                )
                .map(([name]) => ({ name }))
            )
          : new Promise(() => {}),
    },
    datetime: {
      get_today: () => '@today',
      nowdate: () => '@today',
      add_months: (date, months) =>
        date === '@today' && months === -1
          ? '@month_ago'
          : `@add_months(${date}, ${months})`,
      add_days: (date, days) => `@add_days(${date}, ${days})`,
    },
  },
  utils: {
    get_fiscal_year: (_, withDates) =>
      withDates
        ? ['@fiscal_year', '@fiscal_year_start', '@fiscal_year_end']
        : '@fiscal_year',
  },
};

const books = await loadBooks();
const metas = {
  erpnext: readMetas(path.join(erpnextRoot, 'erpnext')),
  frappe: readMetas(path.join(frappeRoot, 'frappe')),
  books: readMetas(path.join(appRoot, 'frappe_books')),
};
deskOptions.metas = new Map(
  [...metas.frappe, ...metas.erpnext].map(([name, { meta }]) => [name, meta])
);
globalThis.frappe = { boot }; // Books' `eval:` rules read `frappe.boot`
globalThis.window = { frappe: { boot } }; // and its report option tokens `window.frappe.boot`

const erpnextReports = readMetas(path.join(erpnextRoot, 'erpnext'), 'Report');
const problems = {};
const checked = { rules: 0, samples: 0, filters: 0, methods: 0 };
await checkQueries();
await checkReports();
checkMethods();
checkNames();
report();

/** Books' rules and report definitions, bundled from the TypeScript sources. */
async function loadBooks() {
  const reportsDir = path.join(frontend, 'reports/erpnext');
  const definitions = readdirSync(reportsDir).filter((file) =>
    /^\s+source:/m.test(readFileSync(path.join(reportsDir, file), 'utf8'))
  );
  const { outputFiles } = await build({
    absWorkingDir: frontend,
    stdin: {
      contents: [
        "export { ERPNEXT_QUERIES } from './src/frappe/erpnextQueries';",
        "export { resolveRule } from './src/frappe/linkSearch';",
        "export { resolveOptions } from './reports/erpnext/defaults';",
        ...definitions.map(
          (file, index) =>
            `export * as report${index} from './reports/erpnext/${file}';`
        ),
      ].join('\n'),
      resolveDir: frontend,
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [
      {
        name: 'stubs',
        setup(builder) {
          builder.onResolve(
            { filter: /^(fyo|src\/web\/api)$/ },
            ({ path }) => ({ path, namespace: 'stub' })
          );
          builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: [
              'export const t = (strings, ...values) => String.raw({ raw: strings }, ...values);',
              "export const call = () => { throw new Error('The drift check has no server'); };",
            ].join('\n'),
          }));
        },
      },
    ],
  });
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`
  );
  const reports = Object.entries(module)
    .filter(([name]) => name.startsWith('report'))
    .flatMap(([, exports]) => Object.values(exports))
    .filter((value) => value?.reportName && value.source && value.filters);
  return { ...module, reports };
}

/** DocType (or Report) JSON under `dir`, by name, with the file it came from. */
function readMetas(dir, type = 'DocType') {
  const found = new Map();
  for (const file of readdirSync(dir, { recursive: true })) {
    const parts = file.split(path.sep);
    const folder = parts.at(-3);
    if (
      !file.endsWith('.json') ||
      !['doctype', 'report'].includes(folder) ||
      parts.at(-1) !== `${parts.at(-2)}.json`
    )
      continue;
    const meta = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    if (meta.doctype === type)
      found.set(meta.name, { meta, file: path.join(dir, file) });
  }
  return found;
}

function problem(section, message) {
  (problems[section] ??= []).push(message);
}

function getMeta(doctype) {
  return (metas.erpnext.get(doctype) ?? metas.frappe.get(doctype))?.meta;
}

function getField(doctype, fieldname) {
  return getMeta(doctype)?.fields.find((df) => df.fieldname === fieldname);
}

/** A doc of `doctype` with every field set (`P.<fieldname>`, 1 for numbers), or none when `empty`. */
function makeSample(doctype, prefix, empty = false) {
  const doc = { doctype, name: `${prefix}.name`, docstatus: 0 };
  for (const df of getMeta(doctype).fields) {
    if (TABLE_TYPES.includes(df.fieldtype)) doc[df.fieldname] = [];
    else if (!empty && !NO_VALUE_TYPES.includes(df.fieldtype)) {
      doc[df.fieldname] = NUMBER_TYPES.includes(df.fieldtype)
        ? 1
        : `${prefix}.${df.fieldname}`;
    }
  }
  return doc;
}

/**
 * Sample (parent, row) pairs for a rule: all fields set, none set, and on
 * each of those every combination of the values its expressions compare
 * fields with, e.g. `doc.payment_type == "Pay"`.
 */
function getSamples(rule, doctype, child) {
  const source = collectExpressions(rule).join('\n');
  const values = new Map();
  const add = (field, literal) =>
    values.set(field, new Set([...(values.get(field) ?? []), literal]));
  for (const [, field, literal] of source.matchAll(
    /\b((?:doc|parent)\.\w+)\s*[!=]==?\s*"([^"]*)"/g
  ))
    add(field, literal);
  for (const [, list, field] of source.matchAll(
    /\[([^\]]*)\]\.includes\(((?:doc|parent)\.\w+)\)/g
  )) {
    for (const [, literal] of list.matchAll(/"([^"]*)"/g)) add(field, literal);
  }
  let combinations = [[]];
  for (const [field, literals] of values) {
    combinations = combinations.flatMap((set) =>
      [...literals].map((literal) => [...set, [field, literal]])
    );
  }

  return [false, true].flatMap((empty) =>
    combinations.map((set) => {
      const parent = makeSample(doctype, 'P', empty);
      const row = child && makeSample(child, 'R', empty);
      for (const [field, literal] of set) {
        const [side, fieldname] = field.split('.');
        (side === 'doc' && row ? row : parent)[fieldname] = literal;
      }
      const label = [
        empty ? 'no fields set' : 'all fields set',
        ...set.map(([field, literal]) => `${field} = "${literal}"`),
      ];
      return { label: label.join(', '), parent, row };
    })
  );
}

function collectExpressions(value) {
  if (typeof value === 'string')
    return value.startsWith('eval:') ? [value.slice(5)] : [];
  return value && typeof value === 'object'
    ? Object.values(value).flatMap(collectExpressions)
    : [];
}

/** Desk's link search args from a form's `get_query` for `key`, as `{ query, filters }` with empty values left out. */
function runERPNextQuery({ desk, frm, queries }, key, row) {
  const getQuery = queries.get(key);
  const parent = frm.doc;
  if (row) desk.locals[row.doctype] = { [row.name]: row };
  desk.thrown.length = 0;
  let result;
  if (typeof getQuery !== 'function') {
    result =
      getQuery?.filters || !getQuery?.query
        ? { filters: getQuery?.filters ?? getQuery }
        : { query: getQuery.query };
  } else {
    const found = getQuery(
      parent,
      (row ?? parent).doctype,
      (row ?? parent).name,
      frm
    );
    result = typeof found === 'string' ? { query: found } : (found ?? {});
  }
  if (desk.thrown.length) throw new Error(desk.thrown[0]);
  return normalize(result);
}

function normalize({ query, filters }) {
  const kept = Array.isArray(filters)
    ? filters
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
  });
}

/** JSON with sorted keys; a function (a value ERPNext works out at runtime) shows as such. */
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

async function checkQueries() {
  for (const [doctype, rules] of Object.entries(books.ERPNEXT_QUERIES)) {
    const entry = metas.erpnext.get(doctype);
    if (!entry) continue; // checkNames reports it
    const formScript = path.relative(
      erpnextRoot,
      entry.file.replace(/\.json$/, '.js')
    );
    const forms = new Map();
    // A form per sample document, as its rules may depend on the values its events saw.
    const openForm = async (parent) => {
      const id = canonical(parent);
      if (!forms.has(id)) {
        const desk = createDesk(deskOptions);
        forms.set(id, {
          desk,
          ...(await desk.openForm(
            doctype,
            formScript,
            structuredClone(parent)
          )),
        });
        if (process.env.DRIFT_DEBUG) console.log(doctype, desk.errors);
      }
      return forms.get(id);
    };

    for (const [key, rule] of Object.entries(rules)) {
      const [table, fieldname] = key.includes('.') ? key.split('.') : [];
      const child = fieldname && getField(doctype, table)?.options;
      const samples = getSamples(rule, doctype, child);
      for (const sample of samples) sample.form = await openForm(sample.parent);
      if (!samples.some(({ form }) => form.queries.has(key))) {
        problem('Link queries', `${doctype} ${key}: ERPNext sets no query`);
        continue;
      }
      compareRule(`${doctype} ${key}`, rule, samples, key);
      checked.rules += 1;
      checked.samples += samples.length;
    }

    const bases = [
      await openForm(makeSample(doctype, 'P')),
      await openForm(makeSample(doctype, 'P', true)),
    ];
    for (const key of new Set(
      bases.flatMap(({ queries }) => [...queries.keys()])
    )) {
      if (key in rules || !isShownByBooks(doctype, key)) continue;
      const results = bases.map((form) => {
        try {
          return runERPNextQuery(form, key, getRowSample(doctype, key));
        } catch {
          return normalize({});
        }
      });
      if (results.some((result) => result !== normalize({}))) {
        problem(
          'Link queries',
          `${doctype} ${key}: ERPNext sets a query, Books has no rule: ${results[0]}`
        );
      }
    }
  }
}

function getRowSample(doctype, key) {
  const [table, fieldname] = key.includes('.') ? key.split('.') : [];
  return fieldname
    ? makeSample(getField(doctype, table).options, 'R')
    : undefined;
}

function compareRule(label, rule, samples, key) {
  const failures = [];
  for (const { form, row, label: sampleLabel } of samples) {
    let erpnext;
    try {
      erpnext = runERPNextQuery(form, key, row);
    } catch (error) {
      failures.push(`${sampleLabel}: ${error.message}`);
      continue;
    }
    const context = row
      ? { doc: row, parent: form.frm.doc }
      : { doc: form.frm.doc, parent: null };
    const ours = normalize(books.resolveRule(rule, context));
    if (ours !== erpnext) {
      problem(
        'Link queries',
        `${label}, ${sampleLabel}:\n      Books:   ${ours}\n      ERPNext: ${erpnext}`
      );
      return;
    }
  }
  if (failures.length === samples.length) {
    problem(
      'Link queries',
      `${label}: ERPNext's query failed on every sample, e.g. ${failures[0]}`
    );
  }
}

/**
 * Whether the Books twin of `doctype` has the field `key` names, so its form
 * shows it; a Link to DocType shows Books' own choice of doctypes instead.
 */
function isShownByBooks(doctype, key) {
  const [fieldname, child] = key.split('.').reverse();
  const df = child
    ? getField(getField(doctype, child)?.options, fieldname)
    : getField(doctype, fieldname);
  if (df?.fieldtype === 'Link' && df.options === 'DocType') return false;
  const twin = metas.books.get(`Books ${doctype}`)?.meta;
  const table = child && twin?.fields.find((df) => df.fieldname === child);
  const fields =
    (table ? metas.books.get(table.options)?.meta : twin)?.fields ?? [];
  return (!child || table) && fields.some((df) => df.fieldname === fieldname);
}

async function checkReports() {
  for (const definition of books.reports) {
    const label = definition.reportName;
    const entry = erpnextReports.get(label);
    if (!entry) continue; // checkNames reports it
    // The report's own JS, as Desk loads it, after the server calls it makes on load
    const desk = createDesk(deskOptions);
    desk.run(path.relative(erpnextRoot, entry.file.replace(/\.json$/, '.js')));
    await new Promise((resolve) => setImmediate(resolve));
    const theirs = desk.context.frappe.query_reports[label]?.filters ?? [];
    for (const filter of definition.filters) {
      const match = theirs.find(
        ({ fieldname }) => fieldname === filter.fieldname
      );
      if (!match) {
        problem(
          'Report filters',
          `${label} ${filter.fieldname}: not an ERPNext filter`
        );
        continue;
      }
      checked.filters += 1;
      for (const key of FILTER_KEYS) {
        const [ours, erpnext] = [
          canonical(toBooksValue(filter, key)),
          canonical(toValue(match[key], key)),
        ];
        if (ours !== erpnext) {
          problem(
            'Report filters',
            `${label} ${filter.fieldname} ${key}: Books ${ours}, ERPNext ${erpnext}`
          );
        }
      }
    }
    for (const { fieldname, reqd } of theirs) {
      if (
        reqd &&
        !definition.filters.some((filter) => filter.fieldname === fieldname)
      ) {
        problem(
          'Report filters',
          `${label} ${fieldname}: ERPNext requires it, Books has no such filter`
        );
      }
    }
  }
}

function toBooksValue(filter, key) {
  const value = filter[key];
  const token = (item) =>
    typeof item === 'string' && item.startsWith('@')
      ? (TOKEN_VALUES[item] ?? item)
      : item;
  if (key === 'options' && typeof value === 'string' && value.startsWith('@'))
    return books.resolveOptions(value);
  if (key === 'default')
    return toValue(Array.isArray(value) ? value.map(token) : token(value), key);
  return toValue(value, key);
}

function toValue(value, key) {
  if (key === 'reqd') return value ? 1 : 0;
  return [undefined, null, ''].includes(value) ? undefined : value;
}

/** The ERPNext methods Books calls: the client's (which must be whitelisted) and the server's. */
function checkMethods() {
  const client = new Set(collectQueryMethods(books.ERPNEXT_QUERIES));
  for (const file of listFiles(
    frontend,
    ['src', 'models', 'reports'],
    /\.(ts|vue)$/
  )) {
    for (const [, method] of readFileSync(file, 'utf8').matchAll(
      /['"`](erpnext(?:\.\w+){2,})['"`]/g
    )) {
      client.add(method);
    }
  }
  const server = new Set();
  for (const file of listPython()) {
    const source = readFileSync(file, 'utf8');
    for (const [, method] of source.matchAll(/["'](erpnext(?:\.\w+){2,})["']/g))
      server.add(method);
    for (const [, module, names] of source.matchAll(
      /^\s*from (erpnext[\w.]*) import (\([^)]*\)|.+)$/gm
    )) {
      for (const name of names.replace(/[()]/g, '').split(',')) {
        const imported = name.trim().split(/\s+as\s+/)[0];
        if (imported) server.add(`${module}.${imported}`);
      }
    }
  }
  checked.methods = new Set([...client, ...server]).size;
  for (const method of client) {
    const found = findPython(method);
    if (!found)
      problem('Methods', `${method}: not in ERPNext (called by the client)`);
    else if (!found.whitelisted)
      problem('Methods', `${method}: not whitelisted, and the client calls it`);
  }
  for (const method of server) {
    if (!client.has(method) && !findPython(method))
      problem('Methods', `${method}: not in ERPNext (called by the server)`);
  }
}

function collectQueryMethods(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) =>
    key === 'query' ? [item] : collectQueryMethods(item)
  );
}

/** A dotted path's function, constant or module in ERPNext, following re-exports; null when missing. */
function findPython(dotted) {
  const parts = dotted.split('.');
  const base = path.join(erpnextRoot, ...parts);
  if (existsSync(`${base}.py`) || existsSync(path.join(base, '__init__.py')))
    return { whitelisted: false };
  const name = parts.pop();
  const moduleBase = path.join(erpnextRoot, ...parts);
  const file = [`${moduleBase}.py`, path.join(moduleBase, '__init__.py')].find(
    existsSync
  );
  if (!file) return null;
  const source = readFileSync(file, 'utf8');
  const definition = source.match(
    new RegExp(`((?:^@.*\\n)*)^(?:async )?def ${name}\\(`, 'm')
  );
  if (definition)
    return { whitelisted: /@frappe\.whitelist\b/.test(definition[1]) };
  if (new RegExp(`^${name}\\s*[:=]`, 'm').test(source))
    return { whitelisted: false };
  const reexport = [
    ...source.matchAll(/^from (erpnext[\w.]*) import (\([^)]*\)|.+)$/gm),
  ].find(([, , names]) => new RegExp(`\\b${name}\\b`).test(names));
  return reexport ? findPython(`${reexport[1]}.${name}`) : null;
}

/** ERPNext (and Frappe) doctypes and fields Books names: rules, reports, server code, Books' twins. */
function checkNames() {
  const exists = (doctype) =>
    metas.erpnext.has(doctype) ||
    metas.frappe.has(doctype) ||
    metas.books.has(doctype);
  const hasField = (doctype, fieldname) =>
    STANDARD_FIELDS.includes(fieldname) ||
    !!getField(doctype, fieldname) ||
    !!metas.books
      .get(doctype)
      ?.meta.fields.some((df) => df.fieldname === fieldname);

  for (const [doctype, rules] of Object.entries(books.ERPNEXT_QUERIES)) {
    if (!metas.erpnext.has(doctype)) {
      problem('Names', `${doctype}: not an ERPNext doctype (link queries)`);
      continue;
    }
    for (const key of Object.keys(rules)) {
      const [fieldname, table] = key.split('.').reverse();
      const tableField = table && getField(doctype, table);
      if (table && !TABLE_TYPES.includes(tableField?.fieldtype))
        problem(
          'Names',
          `${doctype}.${table}: not an ERPNext table (link queries)`
        );
      else if (!getField(table ? tableField.options : doctype, fieldname))
        problem(
          'Names',
          `${doctype} ${key}: not an ERPNext field (link queries)`
        );
    }
  }
  checkQueryRuleFiles();

  for (const { reportName, source, filters } of books.reports) {
    if (!erpnextReports.has(reportName))
      problem('Names', `${reportName}: not an ERPNext report`);
    if (!existsSync(path.join(erpnextRoot, source)))
      problem('Names', `${source}: not in ERPNext (${reportName})`);
    for (const { fieldname, fieldtype, options } of filters) {
      const isDoctype =
        ['Link', 'MultiSelectList'].includes(fieldtype) &&
        !filters.some((filter) => filter.fieldname === options);
      if (isDoctype && !exists(options))
        problem(
          'Names',
          `${reportName} ${fieldname}: ${options} is not a doctype`
        );
    }
  }

  for (const file of listPython()) {
    const source = readFileSync(file, 'utf8');
    const calls =
      /frappe\.(?:get_doc|get_cached_doc|get_all|get_list|new_doc|get_meta|get_single|get_cached_value|has_permission|qb\.DocType|db\.get_value|db\.get_single_value|db\.exists|db\.count|db\.set_value)\(\s*"([^"]+)"(?:\s*,\s*(?:[\w.]+|"[^"]*")\s*,\s*"(\w+)")?/g;
    for (const [, doctype, fieldname] of source.matchAll(calls)) {
      const where = path.relative(appRoot, file);
      if (!exists(doctype))
        problem('Names', `${doctype}: not a doctype (${where})`);
      else if (fieldname && !hasField(doctype, fieldname))
        problem('Names', `${doctype}.${fieldname}: not a field (${where})`);
    }
  }

  for (const [name, { meta }] of metas.books) {
    const twin = name.replace(/^Books /, '');
    if (BOOKS_ONLY.includes(name)) continue;
    if (!getMeta(twin)) {
      problem('Names', `${name}: ERPNext has no ${twin}`);
      continue;
    }
    for (const df of meta.fields.filter(
      ({ fieldtype, options }) =>
        TABLE_TYPES.includes(fieldtype) && !BOOKS_ONLY.includes(options)
    )) {
      const theirs = getField(twin, df.fieldname);
      const childTwin = df.options.replace(/^Books /, '');
      if (theirs?.options !== childTwin)
        problem(
          'Names',
          `${twin}.${df.fieldname}: not ERPNext's table of ${childTwin}, which Books' ${name} has`
        );
    }
  }
}

/** The ERPNext files the rules' comments name exist. */
function checkQueryRuleFiles() {
  const source = readFileSync(
    path.join(frontend, 'src/frappe/erpnextQueries.ts'),
    'utf8'
  );
  for (const [, file] of source.matchAll(/^\s*\/\/ ([\w/]+\.js)/gm)) {
    if (!existsSync(path.join(erpnextRoot, 'erpnext', file)))
      problem('Names', `erpnext/${file}: not in ERPNext (erpnextQueries.ts)`);
  }
}

function listFiles(root, dirs, pattern) {
  return dirs.flatMap((dir) =>
    readdirSync(path.join(root, dir), { recursive: true })
      .filter((file) => pattern.test(file) && !file.includes('node_modules'))
      .map((file) => path.join(root, dir, file))
  );
}

/** Books' server code, less its tests and built assets. */
function listPython() {
  return listFiles(appRoot, ['frappe_books'], /\.py$/).filter(
    (file) => !/[/\\](tests?|public|patches)[/\\]|test_\w+\.py$/.test(file)
  );
}

function report() {
  const sections = ['Link queries', 'Report filters', 'Methods', 'Names'];
  console.log(
    `Compared ${checked.rules} link rules on ${checked.samples} sample documents, ` +
      `${checked.filters} filters of ${books.reports.length} reports, ${checked.methods} ERPNext methods.`
  );
  let count = 0;
  for (const section of sections) {
    const found = [...new Set(problems[section] ?? [])];
    count += found.length;
    console.log(
      `${section}: ${found.length ? `${found.length} difference(s)` : 'no differences'}`
    );
    for (const message of found) console.log(`  - ${message}`);
  }
  process.exit(count ? 1 : 0);
}
