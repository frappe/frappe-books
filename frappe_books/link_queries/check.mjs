/**
 * The nightly check of /books' link queries against Desk's, on a site with
 * the apps' develop branches. For each link field /books shows, it reports:
 *
 * - a rule Desk sets that branches on values, so it cannot be generated, and
 *   that no hand-written form script (`books_doctype_js`) has;
 * - a hand-written rule that gives other results than Desk's on a sample;
 * - a hand-written rule for a field Desk sets no rule on any more.
 *
 * A form where Desk sets no rule leaves the hand-written one free.
 *
 * Run as `node check.mjs < input.json`: the generator's input, plus `scripts`
 * (each doctype's `books_doctype_js`) and `shown` (the keys /books shows, by
 * doctype). Prints the problems and exits 1 when there is any.
 */
import { readFileSync } from 'node:fs';
import { Generator, normalize } from './generate.mjs';

export async function check(input) {
  const generator = new Generator(input);
  const problems = [];
  for (const [doctype, code] of Object.entries(input.forms)) {
    const forms = await generator.openForms(doctype, code);
    const books = loadScript(input.scripts[doctype], doctype, generator);
    for (const key of input.shown[doctype] ?? []) {
      const set = forms.some((form) => form.queries.has(key));
      const label = `${doctype} ${key}`;
      if (books.queries.has(key)) {
        if (!set)
          problems.push(
            `${label}: Desk sets no rule, so the hand-written one is stale`
          );
        else
          problems.push(
            ...compare(generator, doctype, key, forms, books).map(
              (p) => `${label}: ${p}`
            )
          );
      } else if (
        set &&
        generator.isLinkField(doctype, key) &&
        !generator.findRule(doctype, key, forms)
      ) {
        problems.push(
          `${label}: Desk's rule branches on values, and no form script has it`
        );
      }
    }
  }
  return problems;
}

/** Where the hand-written rule gives other results than Desk's, on the samples of both. */
function compare(generator, doctype, key, forms, books) {
  const child = generator.getChild(doctype, key);
  const [full] = forms.filter((form) => form.queries.has(key));
  const row = child && generator.makeSample(child, 'R');
  const reads = generator.run(full, key, full.doc, row).reads;
  for (const side of ['parent', 'row']) {
    books
      .run(key, full.doc, row)
      .reads[side].forEach((fieldname) => reads[side].add(fieldname));
  }

  const samples = generator.getSamples(
    doctype,
    child,
    forms.filter((form) => form.queries.has(key)),
    reads
  );
  for (const { form, parent, row: sampleRow } of samples) {
    const desk = generator.run(form, key, parent, sampleRow).result;
    if (desk === undefined) continue;
    const ours = books.run(key, parent, sampleRow).result;
    if (ours !== desk) {
      return [
        `on ${describe(parent, sampleRow)}:\n      Books: ${ours}\n      Desk:  ${desk}`,
      ];
    }
  }
  return [];
}

/**
 * The doctype's form scripts as /books runs them (src/frappe/formScripts.ts):
 * `setup` and `refresh` on a form, then each `set_query` on samples. Desk's
 * stubs stand for `books.datetime`, so its tokens match.
 */
function loadScript(source, doctype, generator) {
  const handlers = [];
  const locals = {};
  const queries = new Map();
  const books = {
    boot: generator.deskOptions.boot,
    datetime: { nowdate: () => '@today', now_time: () => '@now_time' },
    ui: {
      form: { on: (name, events) => name === doctype && handlers.push(events) },
    },
    model: { set_value() {} },
  };
  const frm = {
    doctype,
    doc: {},
    set_query(fieldname, table, getQuery) {
      if (getQuery === undefined) queries.set(fieldname, table);
      else queries.set(`${table}.${fieldname}`, getQuery);
    },
    set_value() {},
  };
  if (source) {
    new Function('books', 'locals', source)(books, locals);
    for (const events of handlers) {
      events.setup?.(frm);
      events.refresh?.(frm);
    }
  }

  const run = (key, parent, row) => {
    const reads = { parent: new Set(), row: new Set() };
    const parentDoc = track(parent, reads.parent);
    frm.doc = parentDoc;
    if (row) locals[row.doctype] = { [row.name]: track(row, reads.row) };
    try {
      const getQuery = queries.get(key);
      const found =
        typeof getQuery === 'function'
          ? getQuery(parentDoc, (row ?? parent).doctype, (row ?? parent).name)
          : getQuery;
      const value =
        typeof found === 'string' ? { query: found } : (found ?? {});
      return { result: normalize(value), reads };
    } catch (error) {
      return { result: `throws ${error}`, reads };
    }
  };
  return { queries, run };
}

function track(doc, reads) {
  return new Proxy(doc, {
    get(target, key) {
      if (typeof key === 'string') reads.add(key);
      return target[key];
    },
  });
}

/** The values a sample sets apart from all set, for a problem's message. */
function describe(parent, row) {
  const values = (doc) =>
    Object.entries(doc ?? {})
      .filter(
        ([fieldname, value]) =>
          !Array.isArray(value) &&
          value !== 1 &&
          value !== `${doc.name[0]}.${fieldname}`
      )
      .map(([fieldname, value]) => `${fieldname}=${JSON.stringify(value)}`);
  return (
    [...values(parent), ...values(row).map((value) => `row.${value}`)].join(
      ', '
    ) || 'all fields set'
  );
}

// Desk JS failing in a callback fails that callback, as in a browser.
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});
const problems = await check(JSON.parse(readFileSync(0, 'utf8')));
console.log(
  problems.length
    ? `${problems.length} link query problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`
    : "Link queries: /books searches each field it shows as Desk does, or its rule's values are generated"
);
process.exit(problems.length ? 1 : 0);
