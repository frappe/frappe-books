/**
 * Runs ERPNext's Desk JS in a Node sandbox with stubbed Frappe globals, for
 * the drift check: a report's filters.
 * Only what those need is real; every other global, call or property is a
 * harmless stub, and a promise of the server never settles unless `responses`
 * answers its method.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

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
 * A fresh Desk page: ERPNext's bundle loaded as `erpnext.bundle.js` lists it.
 * `metas` maps doctype → DocType JSON; `boot` is `frappe.boot`; `responses`
 * maps a whitelisted method to a function of its args that returns its
 * `message`; `stubs` go on `frappe` (e.g. `datetime`), and `utils` on
 * `erpnext.utils` after each bundle file (e.g. a stubbed get_fiscal_year).
 */
export function createDesk({ erpnext, metas, boot, responses, stubs, utils }) {
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
      get_docfield: (doctype, fieldname) => getField(doctype, fieldname),
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
    return object;
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

  /** Runs a file of the ERPNext checkout in its own scope, as Desk and the bundle do. */
  function run(file) {
    const source = readFileSync(path.join(erpnext, file), 'utf8');
    vm.runInContext(`(function () {\n${source}\n})();`, sandbox, {
      filename: file,
    });
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

  const bundleDir = 'erpnext/public/js';
  const bundle = readFileSync(
    path.join(erpnext, bundleDir, 'erpnext.bundle.js'),
    'utf8'
  );
  for (const [, file] of bundle.matchAll(/^import "\.\/(.+?)";/gm)) {
    if (file.endsWith('.html')) continue;
    attempt(file, () =>
      run(path.join(bundleDir, file.endsWith('.js') ? file : `${file}.js`))
    );
    if (context.erpnext) Object.assign(context.erpnext.utils, utils);
  }

  return { run, locals, errors, thrown, context };
}
