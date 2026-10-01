# Fyo

This is the underlying framework that runs **Books**, at some point it may be
removed into a separate repo, but as of now it's in gestation.

The framework separates the Books interface from its data backend. This app
uses a Frappe database adapter for all document and query operations.

## Pre Req

**Singleton**: The `Fyo` class is used as a singleton throughout Books, this
allows for a single source of truth and a common interface to access the `db`
and `doc` modules.

**Localization**: Since Books' functionality changes depending on region,
regional information (`countryCode`) is required in the initialization process.

**`Doc`**: This is `fyo`'s abstraction for an ORM, the associated files are
located in `model/doc.ts`, all classes exported from `books/models` extend this.

### Terminology

- **Schema**: object that defines shape of the data in the database.
- **Model**: the controller class that extends the `Doc` class, or the `Doc`
  class itself (if a specific controller doesn't exist).
- **doc** (not `Doc`): instance of a Model, i.e. what has the data.

If you are confused, I understand.

## Initialization

Core models are maintained in the `fyo/models` subdirectory. The Frappe site
provides `countryCode` during boot so that Books can load regional models.

A few things have to be done on initialization:

#### 1. Connect To DB

Call `fyo.db.connect(countryCode)` to connect the interface to the current
Frappe site. Frappe owns database creation and migration.

#### 2. Initialize and Register

Done using `fyo.initializeAndRegister` after a database is connected, this should be
passed the bridge models.

This sets the schemas and associated models on the `fyo` object along with a few
other things.

### Sequence

- Read `countryCode` from the Frappe boot response.
- Call `fyo.db.connect(countryCode)`.
- Call `fyo.initializeAndRegister` with the models.
- Register `frappeModels`, then the regional ones from `models/index.ts/getRegionalFrappeModels`.
- Call `loadFrappeDocTypes`, then `fyo.initializeMoneyMaker` with the Frappe-backed System Settings, then load the other singles into `fyo.singles`.

## Translations

All translations take place during runtime, for translations to work, a
`LanguageMap` (for def check `utils/types.ts`) has to be set.

This can be done using `fyo/utils/translation.ts/setLanguageMapOnTranslationString`.

Since translations are runtime, if the code is evaluated before the language map
is loaded, translations won't work. To prevent this, don't maintain translation
strings globally since this will be evaluated before the map is loaded.

## Observers

The doc and db handlers have observers (instances of `Observable`) as
properties, these can be accessed using

- `fyo.db.observer`
- `fyo.doc.observer`

The purpose of the observer is to trigger registered callbacks when some `doc`
operation or `db` operation takes place.

These are schema level observers i.e. they are registered like so:
`method:schemaName`. The callbacks receive args passed to the functions.
