/**
 * Runs apps' Desk JS in a Node sandbox with stubbed Frappe globals: a form's
 * `set_query` registrations, for the link queries /books generates, and a
 * report's filters, for the drift check. Only what those need is real; every
 * other global, call or property is a harmless stub, and a promise of the
 * server never settles unless `responses` answers its method.
 */
import vm from 'node:vm';

const TABLE_TYPES = ['Table', 'Table MultiSelect'];

/** A stub that is every value: callable, constructible, any property is itself. */
const ANY = new Proxy(function () {}, {
  get(_, key) {
    if (key === Symbol.toPrimitive) return () => '';
    if (key === Symbol.iterator) return function* () {};
    return typeof key === 'symbol' ? undefined : ANY;
  },
  apply: () => ANY,
  construct: () => ANY,
  set: () => true,
});

const lenientCache = new WeakMap();

/** `target`, with ANY for what it lacks; plain objects in it are lenient too, except `raw` keys. */
function lenient(target, raw = []) {
  if (!lenientCache.has(target)) {
    lenientCache.set(
      target,
      new Proxy(target, {
        get(object, key) {
          if (!(key in object)) {
            return typeof key === 'symbol' ? undefined : ANY;
          }
          const value = object[key];
          return isPlainObject(value) && !raw.includes(key)
            ? lenient(value, raw)
            : value;
        },
      })
    );
  }
  return lenientCache.get(target);
}

function isPlainObject(value) {
  if (Object.prototype.toString.call(value) !== '[object Object]') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/** jQuery, as far as ERPNext's form scripts use it on data. */
function makeJQuery() {
  const $ = () => ANY;
  $.isPlainObject = isPlainObject;
  $.isArray = Array.isArray;
  $.isEmptyObject = (value) => !value || !Object.keys(value).length;
  $.inArray = (item, list) => (list ?? []).indexOf(item);
  $.each = (items, fn) => {
    for (const [key, value] of Object.entries(items ?? {})) {
      if (
        fn.call(value, Array.isArray(items) ? Number(key) : key, value) ===
        false
      )
        break;
    }
    return items;
  };
  $.map = (items, fn) =>
    Object.entries(items ?? {}).flatMap(([key, value]) => fn(value, key) ?? []);
  $.extend = (...args) => {
    const deep = args[0] === true;
    const [target = {}, ...sources] = deep ? args.slice(1) : args;
    for (const source of sources) {
      for (const [key, value] of Object.entries(source ?? {})) {
        if (value === undefined) continue;
        target[key] =
          deep && isPlainObject(value)
            ? $.extend(
                true,
                isPlainObject(target[key]) ? target[key] : {},
                value
              )
            : value;
      }
    }
    return target;
  };
  return lenient($);
}

/**
 * A fresh Desk page with the apps' `bundles` loaded, as `app_include_js` loads
 * them. `metas` maps doctype → DocType JSON; `boot` is `frappe.boot`;
 * `responses` maps a whitelisted method to a function of its args that
 * returns its `message`; `stubs` go on `frappe` (e.g. `datetime`), and
 * `utils` on `erpnext.utils` (e.g. a stubbed get_fiscal_year).
 */
export function createDesk({
  bundles = [],
  metas,
  boot,
  responses = {},
  stubs = {},
  utils = {},
}) {
  const handlers = {};
  const controllers = {};
  const locals = {};
  const errors = [];
  const thrown = [];
  const $ = makeJQuery();
  const call = (method, args) =>
    method in responses
      ? Promise.resolve({ message: responses[method](args) })
      : new Promise(() => {});

  const frappe = {
    boot,
    query_reports: {},
    session: { user: 'Administrator' },
    provide,
    // Recorded, not thrown, so a form's events run on, as each would in Desk.
    throw: (message) => thrown.push(String(message?.message ?? message)),
    msgprint: () => {},
    get_doc: (doctype, name) => locals[doctype]?.[name],
    get_meta: (doctype) => metas.get(doctype),
    call(options, args) {
      const { method, callback } =
        typeof options === 'string' ? { method: options } : options;
      const promise = call(method, args ?? options.args);
      if (callback) promise.then(callback);
      return promise;
    },
    xcall: (method, args) => call(method, args).then(({ message }) => message),
    model: {
      get_doc: (doctype, name) => locals[doctype]?.[name],
      with_doctype: (_, callback) => callback?.(),
    },
    meta: {
      get_docfields: (doctype, _, filters = {}) =>
        (metas.get(doctype)?.fields ?? []).filter((df) =>
          Object.entries(filters).every(([key, value]) => df[key] === value)
        ),
      // A field the meta lacks is a blank one, as Desk scripts set its properties.
      get_docfield: (doctype, fieldname) => getField(doctype, fieldname) ?? {},
      has_field: (doctype, fieldname) => !!getField(doctype, fieldname),
    },
    ui: {
      form: {
        handlers,
        on: onForm,
        set_controller: (doctype, Controller) =>
          (controllers[doctype] = Controller),
        Controller: class FormController {
          constructor(options) {
            $.extend(this, options);
          }
        },
      },
    },
    ...stubs,
  };
  for (const doc of boot.docs ?? []) {
    (locals[doc.doctype] ??= {})[doc.name] = doc;
  }

  const context = {
    frappe: lenient(frappe, ['boot', 'query_reports', 'handlers']),
    $,
    jQuery: $,
    locals,
    cur_frm: ANY,
    __: (text, values) =>
      String(text).replace(/\{(\d+)\}/g, (_, index) => values?.[index] ?? ''),
    flt: (value) => parseFloat(value) || 0,
    cint: (value) => parseInt(value) || 0,
    cstr: (value) => (value == null ? '' : String(value)),
    in_list: (list, item) => !!list?.includes(item),
    extend_cscript(cscript, controller) {
      $.extend(cscript, controller);
      Object.setPrototypeOf(cscript, Object.getPrototypeOf(controller));
      return cscript;
    },
    setTimeout: () => 0,
    setInterval: () => 0,
  };
  const sandbox = vm.createContext(
    new Proxy(context, {
      has: () => true,
      get: (target, key) =>
        key in target ? target[key] : key in globalThis ? globalThis[key] : ANY,
    })
  );

  context.window = vm.runInContext('this', sandbox);

  function getField(doctype, fieldname) {
    return metas.get(doctype)?.fields.find((df) => df.fieldname === fieldname);
  }

  function provide(namespace) {
    let object = context;
    for (const part of namespace.split('.')) {
      if (!(part in object))
        object[part] = object === context ? lenient({}) : {};
      object = object[part];
    }
    if (namespace === 'erpnext.utils') stubUtils(object);
    return object;
  }

  /** `utils` on `erpnext.utils` for good: the bundle's own assignments to them do nothing. */
  function stubUtils(object) {
    for (const [key, value] of Object.entries(utils)) {
      Object.defineProperty(object, key, {
        get: () => value,
        set() {},
        configurable: true,
      });
    }
  }

  function onForm(doctype, fieldname, handler) {
    const add = (event, fn) => {
      ((handlers[doctype] ??= {})[event] ??= []).push(fn);
      if (context.cur_frm !== ANY && context.cur_frm.doctype === doctype) {
        context.cur_frm.events[event] = fn;
      }
    };
    if (handler) add(fieldname, handler);
    else for (const [event, fn] of Object.entries(fieldname)) add(event, fn);
  }

  /** Runs `code` in its own scope, as Desk evaluates a form's or report's JS. */
  function evaluate(code, filename) {
    vm.runInContext(`(function () {\n${code}\n})();`, sandbox, { filename });
  }

  /** Calls `fn`, recording what it throws instead of stopping. */
  function attempt(label, fn) {
    try {
      const result = fn();
      result?.catch?.((error) => errors.push(`${label}: ${error}`));
      return result;
    } catch (error) {
      errors.push(`${label}: ${error}`);
    }
  }

  for (const [index, code] of bundles.entries()) {
    attempt(`bundle ${index}`, () =>
      vm.runInContext(code, sandbox, { filename: `bundle${index}.js` })
    );
  }

  /**
   * A form of `doctype` loaded as Desk loads one: its JS (`code`, Desk's
   * `__js`), its controller, then setup, onload, refresh and a change of every
   * field, each after the server calls of the one before. Returns its
   * `set_query` rules by `fieldname` or `table.fieldname`.
   */
  async function openForm(doctype, code, doc) {
    const queries = new Map();
    const frm = makeForm(doctype, doc, queries);
    context.cur_frm = frm;
    locals[doctype] = { [doc.name]: doc };
    for (const df of metas.get(doctype).fields) {
      for (const row of TABLE_TYPES.includes(df.fieldtype)
        ? (doc[df.fieldname] ?? [])
        : []) {
        (locals[row.doctype] ??= {})[row.name] = row;
      }
    }
    attempt(doctype, () => evaluate(code, `${doctype}.js`));
    const Controller = controllers[doctype];
    if (Controller && !(frm.cscript instanceof Controller)) {
      attempt('controller', () => {
        frm.cscript = context.extend_cscript(
          frm.cscript,
          new Controller({ frm })
        );
      });
    }

    const fieldnames = metas.get(doctype).fields.map((df) => df.fieldname);
    for (const event of [
      'setup',
      'onload',
      'refresh',
      'onload_post_render',
      ...fieldnames,
    ]) {
      trigger(frm, event);
      await new Promise((resolve) => setImmediate(resolve));
    }
    return { frm, queries, errors };
  }

  function trigger(frm, event) {
    for (const fn of handlers[frm.doctype]?.[event] ?? []) {
      attempt(event, () => fn(frm, frm.doctype, frm.docname));
    }
    if (typeof frm.cscript[event] === 'function') {
      attempt(event, () =>
        frm.cscript[event](frm.doc, frm.doctype, frm.docname)
      );
    }
  }

  function makeForm(doctype, doc, queries) {
    const meta = metas.get(doctype);
    const fieldsDict = Object.fromEntries(
      meta.fields.map((df) => [
        df.fieldname,
        makeField(df, df.fieldname, queries),
      ])
    );
    return lenient(
      {
        doctype,
        docname: doc.name,
        doc,
        meta,
        fields_dict: fieldsDict,
        fields: Object.values(fieldsDict),
        cscript: {},
        events: {},
        is_new: () => true,
        get_field: (fieldname) => fieldsDict[fieldname],
        get_docfield: (fieldname, child) =>
          child
            ? getField(getField(doctype, fieldname)?.options, child)
            : getField(doctype, fieldname),
        trigger: (event) => trigger(context.cur_frm, event),
        set_query(fieldname, table, fn) {
          if (fn) {
            if (fieldsDict[table]) queries.set(`${table}.${fieldname}`, fn);
          } else if (fieldsDict[fieldname]) {
            queries.set(fieldname, table);
          }
        },
      },
      ['doc', 'fields_dict', 'cscript', 'events']
    );
  }

  /** A form field; `get_query` set on it, or on a field of its grid, is a rule. */
  function makeField(df, key, queries) {
    // A grid gives any fieldname a field, as Desk's does for get_query.
    const grid = TABLE_TYPES.includes(df.fieldtype)
      ? lenient({
          get_field: (fieldname) =>
            makeField(
              getField(df.options, fieldname) ?? { fieldname },
              `${key}.${fieldname}`,
              queries
            ),
        })
      : ANY;
    return new Proxy(
      { df, grid },
      {
        get: (target, prop) => (prop in target ? target[prop] : ANY),
        set: (target, prop, value) => {
          if (prop === 'get_query') queries.set(key, value);
          else target[prop] = value;
          return true;
        },
      }
    );
  }

  return { evaluate, openForm, locals, errors, thrown, context };
}
