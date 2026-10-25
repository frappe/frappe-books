/** Frappe's doctypes that Books models name, which the app does not ship, as Frappe's getdoctype sends them. */

// Frappe's Currency, which the app does not ship.
const currencyMeta = {
  name: 'Currency',
  autoname: 'field:currency_name',
  permissions: [],
  fields: [
    {
      fieldname: 'currency_name',
      fieldtype: 'Data',
      label: 'Currency Name',
      reqd: 1,
    },
    {
      fieldname: 'enabled',
      fieldtype: 'Check',
      label: 'Enabled',
      default: '0',
    },
    { fieldname: 'fraction', fieldtype: 'Data', label: 'Fraction' },
    { fieldname: 'fraction_units', fieldtype: 'Int', label: 'Fraction Units' },
    {
      fieldname: 'smallest_currency_fraction_value',
      fieldtype: 'Currency',
      label: 'Smallest Currency Fraction Value',
    },
    { fieldname: 'symbol', fieldtype: 'Data', label: 'Symbol' },
    {
      fieldname: 'number_format',
      fieldtype: 'Select',
      label: 'Number Format',
      options: '\n#,###.##\n#.###,##',
    },
    {
      fieldname: 'symbol_on_right',
      fieldtype: 'Check',
      label: 'Show Currency Symbol on Right Side',
      default: '0',
    },
  ],
};

// Frappe's Country, which the app does not ship.
const countryMeta = {
  name: 'Country',
  autoname: 'field:country_name',
  translated_doctype: 1,
  permissions: [],
  fields: [
    {
      fieldname: 'country_name',
      fieldtype: 'Data',
      label: 'Country Name',
      reqd: 1,
    },
    { fieldname: 'date_format', fieldtype: 'Data', label: 'Date Format' },
    { fieldname: 'time_format', fieldtype: 'Data', label: 'Time format' },
    { fieldname: 'time_zones', fieldtype: 'Text', label: 'Time Zones' },
    { fieldname: 'code', fieldtype: 'Data', label: 'Code' },
  ],
};

// Frappe's Print Format, which the app does not ship; its builder fields are left out.
const printFormatMeta = {
  name: 'Print Format',
  autoname: 'Prompt',
  sort_field: 'creation',
  permissions: [],
  fields: [
    {
      fieldname: 'doc_type',
      fieldtype: 'Link',
      label: 'DocType',
      options: 'DocType',
      in_list_view: 1,
    },
    {
      fieldname: 'module',
      fieldtype: 'Link',
      label: 'Module',
      options: 'Module Def',
    },
    {
      fieldname: 'disabled',
      fieldtype: 'Check',
      label: 'Disabled',
      default: '0',
    },
    {
      fieldname: 'standard',
      fieldtype: 'Select',
      label: 'Standard',
      options: 'No\nYes',
      default: 'No',
      reqd: 1,
      no_copy: 1,
    },
    {
      fieldname: 'custom_format',
      fieldtype: 'Check',
      label: 'Custom Format',
      default: '0',
    },
    {
      fieldname: 'print_format_type',
      fieldtype: 'Select',
      label: 'Print Format Type',
      options: 'Jinja\nJS',
      default: 'Jinja',
    },
    { fieldname: 'html', fieldtype: 'Code', label: 'HTML', options: 'Jinja' },
    { fieldname: 'css_section', fieldtype: 'Section Break' },
    {
      fieldname: 'css',
      fieldtype: 'Code',
      label: 'Custom CSS',
      options: 'CSS',
    },
    {
      fieldname: 'custom_html_help',
      fieldtype: 'HTML',
      label: 'Custom HTML Help',
    },
  ],
};

// Frappe's Address, which the app does not ship.
const addressMeta = {
  name: 'Address',
  search_fields: 'country, state',
  permissions: [],
  fields: [
    {
      fieldname: 'address_details',
      fieldtype: 'Section Break',
      options: 'fa fa-map-marker',
    },
    { fieldname: 'address_title', fieldtype: 'Data', label: 'Address Title' },
    {
      fieldname: 'address_type',
      fieldtype: 'Select',
      label: 'Address Type',
      options:
        'Billing\nShipping\nOffice\nPersonal\nPlant\nPostal\nShop\nSubsidiary\nWarehouse\nCurrent\nPermanent\nOther',
      reqd: 1,
      in_list_view: 1,
    },
    {
      fieldname: 'address_line1',
      fieldtype: 'Data',
      label: 'Address Line 1',
      reqd: 1,
    },
    { fieldname: 'address_line2', fieldtype: 'Data', label: 'Address Line 2' },
    {
      fieldname: 'city',
      fieldtype: 'Data',
      label: 'City/Town',
      reqd: 1,
      in_list_view: 1,
    },
    { fieldname: 'county', fieldtype: 'Data', label: 'County' },
    { fieldname: 'state', fieldtype: 'Data', label: 'State/Province' },
    {
      fieldname: 'country',
      fieldtype: 'Link',
      label: 'Country',
      options: 'Country',
      reqd: 1,
    },
    { fieldname: 'pincode', fieldtype: 'Data', label: 'Postal Code' },
    { fieldname: 'column_break0', fieldtype: 'Column Break' },
    {
      fieldname: 'email_id',
      fieldtype: 'Data',
      label: 'Email Address',
      options: 'Email',
    },
    { fieldname: 'phone', fieldtype: 'Data', label: 'Phone', options: 'Phone' },
    { fieldname: 'fax', fieldtype: 'Data', label: 'Fax' },
    {
      fieldname: 'is_primary_address',
      fieldtype: 'Check',
      label: 'Preferred Billing Address',
      default: '0',
    },
    {
      fieldname: 'is_shipping_address',
      fieldtype: 'Check',
      label: 'Preferred Shipping Address',
      default: '0',
    },
    {
      fieldname: 'disabled',
      fieldtype: 'Check',
      label: 'Disabled',
      default: '0',
    },
    {
      fieldname: 'linked_with',
      fieldtype: 'Section Break',
      label: 'Reference',
      options: 'fa fa-pushpin',
    },
    {
      fieldname: 'links',
      fieldtype: 'Table',
      label: 'Links',
      options: 'Dynamic Link',
    },
  ],
};

// Frappe's Dynamic Link, which the app does not ship.
const dynamicLinkMeta = {
  name: 'Dynamic Link',
  istable: 1,
  permissions: [],
  fields: [
    {
      fieldname: 'link_doctype',
      fieldtype: 'Link',
      label: 'Link Document Type',
      options: 'DocType',
      reqd: 1,
      in_list_view: 1,
    },
    {
      fieldname: 'link_name',
      fieldtype: 'Dynamic Link',
      label: 'Link Name',
      options: 'link_doctype',
      reqd: 1,
      in_list_view: 1,
    },
    {
      fieldname: 'link_title',
      fieldtype: 'Read Only',
      label: 'Link Title',
      read_only: 1,
      in_list_view: 1,
    },
  ],
};

// Frappe's Contact, which the app does not ship.
const contactMeta = {
  name: 'Contact',
  naming_rule: 'By script',
  title_field: 'full_name',
  permissions: [],
  fields: [
    {
      fieldname: 'contact_section',
      fieldtype: 'Section Break',
      options: 'fa fa-user',
    },
    { fieldname: 'first_name', fieldtype: 'Data', label: 'First Name' },
    { fieldname: 'middle_name', fieldtype: 'Data', label: 'Middle Name' },
    { fieldname: 'last_name', fieldtype: 'Data', label: 'Last Name' },
    {
      fieldname: 'full_name',
      fieldtype: 'Data',
      label: 'Full Name',
      read_only: 1,
      hidden: 1,
    },
    {
      fieldname: 'email_id',
      fieldtype: 'Data',
      label: 'Email Address',
      options: 'Email',
      read_only: 1,
      in_list_view: 1,
    },
    { fieldname: 'user', fieldtype: 'Link', label: 'User Id', options: 'User' },
    {
      fieldname: 'address',
      fieldtype: 'Link',
      label: 'Address',
      options: 'Address',
    },
    {
      fieldname: 'sync_with_google_contacts',
      fieldtype: 'Check',
      label: 'Sync with Google Contacts',
      default: '0',
    },
    { fieldname: 'cb00', fieldtype: 'Column Break' },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      options: 'Passive\nOpen\nReplied',
      default: 'Passive',
      in_list_view: 1,
    },
    {
      fieldname: 'salutation',
      fieldtype: 'Link',
      label: 'Salutation',
      options: 'Salutation',
    },
    { fieldname: 'designation', fieldtype: 'Data', label: 'Designation' },
    {
      fieldname: 'gender',
      fieldtype: 'Link',
      label: 'Gender',
      options: 'Gender',
    },
    {
      fieldname: 'phone',
      fieldtype: 'Data',
      label: 'Phone',
      options: 'Phone',
      read_only: 1,
      in_list_view: 1,
    },
    {
      fieldname: 'mobile_no',
      fieldtype: 'Data',
      label: 'Mobile No',
      options: 'Phone',
      read_only: 1,
    },
    { fieldname: 'company_name', fieldtype: 'Data', label: 'Company Name' },
    {
      fieldname: 'image',
      fieldtype: 'Attach Image',
      label: 'Image',
      hidden: 1,
    },
    {
      fieldname: 'sb_00',
      fieldtype: 'Section Break',
      label: 'Google Contacts',
      depends_on:
        'eval:doc.sync_with_google_contacts || doc.pulled_from_google_contacts',
    },
    {
      fieldname: 'google_contacts',
      fieldtype: 'Link',
      label: 'Google Contacts',
      options: 'Google Contacts',
    },
    {
      fieldname: 'google_contacts_id',
      fieldtype: 'Data',
      label: 'Google Contacts Id',
      read_only: 1,
    },
    { fieldname: 'cb_00', fieldtype: 'Column Break' },
    {
      fieldname: 'pulled_from_google_contacts',
      fieldtype: 'Check',
      label: 'Pulled from Google Contacts',
      read_only: 1,
      default: '0',
    },
    {
      fieldname: 'sb_01',
      fieldtype: 'Section Break',
      label: 'Contact Details',
    },
    {
      fieldname: 'email_ids',
      fieldtype: 'Table',
      label: 'Email IDs',
      options: 'Contact Email',
    },
    {
      fieldname: 'phone_nos',
      fieldtype: 'Table',
      label: 'Contact Numbers',
      options: 'Contact Phone',
    },
    {
      fieldname: 'contact_details',
      fieldtype: 'Section Break',
      label: 'Reference',
      options: 'fa fa-pushpin',
    },
    {
      fieldname: 'links',
      fieldtype: 'Table',
      label: 'Links',
      options: 'Dynamic Link',
    },
    {
      fieldname: 'is_primary_contact',
      fieldtype: 'Check',
      label: 'Is Primary Contact',
      default: '0',
    },
    {
      fieldname: 'more_info',
      fieldtype: 'Section Break',
      label: 'More Information',
      options: 'fa fa-file-text',
    },
    { fieldname: 'department', fieldtype: 'Data', label: 'Department' },
    {
      fieldname: 'unsubscribed',
      fieldtype: 'Check',
      label: 'Unsubscribed',
      default: '0',
    },
  ],
};

// Frappe's Contact Email, which the app does not ship.
const contactEmailMeta = {
  name: 'Contact Email',
  istable: 1,
  permissions: [],
  fields: [
    {
      fieldname: 'email_id',
      fieldtype: 'Data',
      label: 'Email ID',
      options: 'Email',
      reqd: 1,
      in_list_view: 1,
    },
    {
      fieldname: 'is_primary',
      fieldtype: 'Check',
      label: 'Is Primary',
      default: '0',
      in_list_view: 1,
    },
  ],
};

// Frappe's Contact Phone, which the app does not ship.
const contactPhoneMeta = {
  name: 'Contact Phone',
  istable: 1,
  permissions: [],
  fields: [
    {
      fieldname: 'phone',
      fieldtype: 'Data',
      label: 'Number',
      options: 'Phone',
      reqd: 1,
      in_list_view: 1,
    },
    {
      fieldname: 'is_primary_phone',
      fieldtype: 'Check',
      label: 'Is Primary Phone',
      default: '0',
      in_list_view: 1,
    },
    {
      fieldname: 'is_primary_mobile_no',
      fieldtype: 'Check',
      label: 'Is Primary Mobile',
      default: '0',
      in_list_view: 1,
    },
  ],
};

export const frappeMetas = [
  currencyMeta,
  countryMeta,
  printFormatMeta,
  addressMeta,
  contactMeta,
  contactEmailMeta,
  contactPhoneMeta,
  dynamicLinkMeta,
];
