// File generato da scripts/gen-catalog.ts: non modificare a mano.
// OpenAPI Fatture in Cloud 2.1.8 (commit 362e3fe), 123 operazioni.

import type { CatalogOperation } from './catalog-types.js';

export const SPEC_VERSION = "2.1.8";

export const OPERATIONS: readonly CatalogOperation[] = [
  {
    "id": "createArchiveDocument",
    "method": "POST",
    "path": "/c/{company_id}/archive",
    "tag": "Archive",
    "summary": "Create Archive Document",
    "effect": "write",
    "scopes": [
      "archive:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "date": "string",
          "description": "string",
          "category": "string",
          "attachment_token": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "createCashbookEntry",
    "method": "POST",
    "path": "/c/{company_id}/cashbook",
    "tag": "Cashbook",
    "summary": "Create Cashbook Entry",
    "effect": "write",
    "scopes": [
      "cashbook:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "string",
          "date": "string",
          "description": "string",
          "kind": "\"cashbook\"|\"issued_document\"|\"received_document\"|\"tax\"|\"receipt\"|\"ts_pay\"",
          "type": "\"in\"|\"out\"",
          "entity_name": "string",
          "document": "object",
          "amount_in": "number",
          "payment_account_in": "object",
          "amount_out": "number",
          "payment_account_out": "object"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "createClient",
    "method": "POST",
    "path": "/c/{company_id}/entities/clients",
    "tag": "Clients",
    "summary": "Create Client",
    "effect": "write",
    "scopes": [
      "entity.clients:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "code": "string",
          "name": "string",
          "type": "\"company\"|\"person\"|\"pa\"|\"condo\"",
          "first_name": "string",
          "last_name": "string",
          "contact_person": "string",
          "vat_number": "string",
          "tax_code": "string",
          "address_street": "string",
          "address_postal_code": "string",
          "address_city": "string",
          "address_province": "string",
          "address_extra": "string",
          "country": "string",
          "country_iso": "string",
          "email": "string",
          "certified_email": "string",
          "phone": "string",
          "fax": "string",
          "notes": "string",
          "default_vat": "object",
          "default_payment_terms": "integer",
          "default_payment_terms_type": "\"standard\"|\"end_of_month\"",
          "default_payment_method": "object",
          "bank_name": "string",
          "bank_iban": "string",
          "bank_swift_code": "string",
          "shipping_address": "string",
          "e_invoice": "boolean",
          "discount_highlight": "boolean",
          "ei_code": "string",
          "default_discount": "number",
          "has_intent_declaration": "boolean",
          "intent_declaration_protocol_number": "string",
          "intent_declaration_protocol_date": "string",
          "price_list_id": "string",
          "created_at": "string",
          "updated_at": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "createF24",
    "method": "POST",
    "path": "/c/{company_id}/taxes",
    "tag": "Taxes",
    "summary": "Create F24",
    "effect": "write",
    "scopes": [
      "taxes:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "due_date": "string",
          "status": "\"paid\"|\"not_paid\"|\"reversed\"",
          "payment_account": "object",
          "amount": "number",
          "attachment_token": "string",
          "description": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "createIssuedDocument",
    "method": "POST",
    "path": "/c/{company_id}/issued_documents",
    "tag": "Issued Documents",
    "summary": "Create Issued Document",
    "effect": "write",
    "scopes": [
      "issued_documents.{tipo}:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "entity": "object",
          "type": "\"invoice\"|\"quote\"|\"proforma\"|\"receipt\"|\"delivery_note\"|\"credit_note\"|\"order\"|\"work_report\"|\"supplier_order\"|\"self_own_invoice\"|\"self_supplier_invoice\"",
          "number": "integer",
          "numeration": "string",
          "date": "string",
          "year": "integer",
          "currency": "object",
          "language": "object",
          "subject": "string",
          "visible_subject": "string",
          "rc_center": "string",
          "notes": "string",
          "rivalsa": "number",
          "cassa": "number",
          "cassa_taxable": "number",
          "amount_cassa_taxable": "number",
          "cassa2": "number",
          "cassa2_taxable": "number",
          "amount_cassa2_taxable": "number",
          "global_cassa_taxable": "number",
          "amount_global_cassa_taxable": "number",
          "withholding_tax": "number",
          "withholding_tax_taxable": "number",
          "other_withholding_tax": "number",
          "stamp_duty": "number",
          "payment_method": "object",
          "use_split_payment": "boolean",
          "use_gross_prices": "boolean",
          "e_invoice": "boolean",
          "ei_data": "object",
          "ei_cassa_type": "string",
          "ei_cassa2_type": "string",
          "ei_withholding_tax_causal": "string",
          "ei_other_withholding_tax_type": "string",
          "ei_other_withholding_tax_causal": "string",
          "items_list": "object[]",
          "payments_list": "object[]",
          "template": "object",
          "delivery_note_template": "object",
          "acc_inv_template": "object",
          "h_margins": "integer",
          "v_margins": "integer",
          "show_payments": "boolean",
          "show_payment_method": "boolean",
          "show_totals": "\"none\"|\"nets\"|\"all\"",
          "show_notification_button": "boolean",
          "show_tspay_button": "boolean",
          "delivery_note": "boolean",
          "accompanying_invoice": "boolean",
          "dn_number": "integer",
          "dn_date": "string",
          "dn_ai_packages_number": "string",
          "dn_ai_weight": "string",
          "dn_ai_causal": "string",
          "dn_ai_destination": "string",
          "dn_ai_transporter": "string",
          "dn_ai_notes": "string",
          "is_marked": "boolean",
          "amount_due_discount": "number",
          "amount_rivalsa_taxable": "number",
          "amount_withholding_tax_taxable": "number",
          "amount_other_withholding_tax_taxable": "number",
          "amount_enasarco_taxable": "number",
          "extra_data": "object",
          "seen_date": "string",
          "next_due_date": "string",
          "url": "string",
          "dn_url": "string",
          "ai_url": "string",
          "attachment_token": "string",
          "ei_raw": "object",
          "ei_status": "\"attempt\"|\"missing\"|\"not_sent\"|\"sent\"|\"pending\"|\"processing\"|\"error\"|\"discarded\"|\"not_delivered\"|\"accepted\"|\"rejected\"|\"no_response\"|\"manual_accepted\"|\"manual_rejected\"",
          "price_list_id": "string",
          "locked": "boolean",
          "created_at": "string",
          "updated_at": "string"
        },
        "options": [
          "fix_payments",
          "create_from",
          "transform",
          "keep_copy",
          "join_type"
        ]
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "createPaymentAccount",
    "method": "POST",
    "path": "/c/{company_id}/settings/payment_accounts",
    "tag": "Settings",
    "summary": "Create Payment Account",
    "effect": "write",
    "scopes": [
      "settings:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "name": "string",
          "type": "\"standard\"|\"bank\"",
          "iban": "string",
          "sia": "string",
          "cuc": "string",
          "virtual": "boolean"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "createPaymentMethod",
    "method": "POST",
    "path": "/c/{company_id}/settings/payment_methods",
    "tag": "Settings",
    "summary": "Create Payment Method",
    "effect": "write",
    "scopes": [
      "settings:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "name": "string",
          "type": "\"standard\"|\"riba\"",
          "is_default": "boolean",
          "default_payment_account": "object",
          "details": "object[]",
          "bank_iban": "string",
          "bank_name": "string",
          "bank_beneficiary": "string",
          "ei_payment_method": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "createProduct",
    "method": "POST",
    "path": "/c/{company_id}/products",
    "tag": "Products",
    "summary": "Create Product",
    "effect": "write",
    "scopes": [
      "products:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "name": "string",
          "code": "string",
          "net_price": "number",
          "gross_price": "number",
          "use_gross_price": "boolean",
          "default_vat": "object",
          "net_cost": "number",
          "measure": "string",
          "description": "string",
          "category": "string",
          "notes": "string",
          "in_stock": "boolean",
          "stock_initial": "number",
          "average_cost": "number",
          "average_price": "number",
          "created_at": "string",
          "updated_at": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "createReceipt",
    "method": "POST",
    "path": "/c/{company_id}/receipts",
    "tag": "Receipts",
    "summary": "Create Receipt",
    "effect": "write",
    "scopes": [
      "receipts:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "date": "string",
          "number": "number",
          "numeration": "string",
          "amount_net": "number",
          "amount_vat": "number",
          "amount_gross": "number",
          "use_gross_prices": "boolean",
          "type": "\"till_receipt\"|\"sales_receipt\"",
          "description": "string",
          "rc_center": "string",
          "created_at": "string",
          "updated_at": "string",
          "payment_account": "object",
          "items_list": "object[]"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "createReceivedDocument",
    "method": "POST",
    "path": "/c/{company_id}/received_documents",
    "tag": "Received Documents",
    "summary": "Create Received Document",
    "effect": "write",
    "scopes": [
      "received_documents:a",
      "stock:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "type": "\"expense\"|\"passive_credit_note\"|\"passive_delivery_note\"|\"self_invoice\"",
          "entity": "object",
          "date": "string",
          "category": "string",
          "description": "string",
          "amount_net": "number",
          "amount_vat": "number",
          "amount_withholding_tax": "number",
          "amount_other_withholding_tax": "number",
          "amortization": "number",
          "rc_center": "string",
          "invoice_number": "string",
          "is_marked": "boolean",
          "is_detailed": "boolean",
          "e_invoice": "boolean",
          "currency": "object",
          "tax_deductibility": "number",
          "vat_deductibility": "number",
          "items_list": "object[]",
          "payments_list": "object[]",
          "auto_calculate": "boolean",
          "attachment_token": "string",
          "locked": "boolean",
          "created_at": "string",
          "updated_at": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "createSupplier",
    "method": "POST",
    "path": "/c/{company_id}/entities/suppliers",
    "tag": "Suppliers",
    "summary": "Create Supplier",
    "effect": "write",
    "scopes": [
      "entity.suppliers:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "code": "string",
          "name": "string",
          "type": "\"company\"|\"person\"|\"pa\"|\"condo\"",
          "first_name": "string",
          "last_name": "string",
          "contact_person": "string",
          "vat_number": "string",
          "tax_code": "string",
          "address_street": "string",
          "address_postal_code": "string",
          "address_city": "string",
          "address_province": "string",
          "address_extra": "string",
          "country": "string",
          "country_iso": "string",
          "email": "string",
          "certified_email": "string",
          "phone": "string",
          "fax": "string",
          "notes": "string",
          "bank_iban": "string",
          "created_at": "string",
          "updated_at": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "createVatType",
    "method": "POST",
    "path": "/c/{company_id}/settings/vat_types",
    "tag": "Settings",
    "summary": "Create Vat Type",
    "effect": "write",
    "scopes": [
      "settings:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "value": "number",
          "description": "string",
          "notes": "string",
          "e_invoice": "boolean",
          "ei_type": "string",
          "ei_description": "string",
          "is_disabled": "boolean",
          "default": "boolean"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "CreateWebhooksSubscription",
    "method": "POST",
    "path": "/c/{company_id}/subscriptions",
    "tag": "Webhooks",
    "summary": "Create a Webhook Subscription",
    "effect": "external",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "string",
          "sink": "string",
          "verified": "boolean",
          "types": "\"it.fattureincloud.webhooks.issued_documents.invoices.create\"|\"it.fattureincloud.webhooks.issued_documents.invoices.update\"|\"it.fattureincloud.webhooks.issued_documents.invoices.delete\"|\"it.fattureincloud.webhooks.issued_documents.quotes.create\"|\"it.fattureincloud.webhooks.issued_documents.quotes.update\"|\"it.fattureincloud.webhooks.issued_documents.quotes.delete\"|\"it.fattureincloud.webhooks.issued_documents.proformas.create\"|\"it.fattureincloud.webhooks.issued_documents.proformas.update\"|\"it.fattureincloud.webhooks.issued_documents.proformas.delete\"|\"it.fattureincloud.webhooks.issued_documents.receipts.create\"|\"it.fattureincloud.webhooks.issued_documents.receipts.update\"|\"it.fattureincloud.webhooks.issued_documents.receipts.delete\"|\"it.fattureincloud.webhooks.issued_documents.delivery_notes.create\"|\"it.fattureincloud.webhooks.issued_documents.delivery_notes.update\"|\"it.fattureincloud.webhooks.issued_documents.delivery_notes.delete\"|\"it.fattureincloud.webhooks.issued_documents.credit_notes.create\"|\"it.fattureincloud.webhooks.issued_documents.credit_notes.update\"|\"it.fattureincloud.webhooks.issued_documents.credit_notes.delete\"|\"it.fattureincloud.webhooks.issued_documents.orders.create\"|\"it.fattureincloud.webhooks.issued_documents.orders.update\"|\"it.fattureincloud.webhooks.issued_documents.orders.delete\"|\"it.fattureincloud.webhooks.issued_documents.work_reports.create\"|\"it.fattureincloud.webhooks.issued_documents.work_reports.update\"|\"it.fattureincloud.webhooks.issued_documents.work_reports.delete\"|\"it.fattureincloud.webhooks.issued_documents.supplier_orders.create\"|\"it.fattureincloud.webhooks.issued_documents.supplier_orders.update\"|\"it.fattureincloud.webhooks.issued_documents.supplier_orders.delete\"|\"it.fattureincloud.webhooks.issued_documents.self_supplier_invoices.create\"|\"it.fattureincloud.webhooks.issued_documents.self_supplier_invoices.update\"|\"it.fattureincloud.webhooks.issued_documents.self_supplier_invoices.delete\"|\"it.fattureincloud.webhooks.issued_documents.self_own_invoices.create\"|\"it.fattureincloud.webhooks.issued_documents.self_own_invoices.update\"|\"it.fattureincloud.webhooks.issued_documents.self_own_invoices.delete\"|\"it.fattureincloud.webhooks.issued_documents.all.create\"|\"it.fattureincloud.webhooks.issued_documents.all.update\"|\"it.fattureincloud.webhooks.issued_documents.all.delete\"|\"it.fattureincloud.webhooks.received_documents.create\"|\"it.fattureincloud.webhooks.received_documents.update\"|\"it.fattureincloud.webhooks.received_documents.delete\"|\"it.fattureincloud.webhooks.receipts.create\"|\"it.fattureincloud.webhooks.receipts.update\"|\"it.fattureincloud.webhooks.receipts.delete\"|\"it.fattureincloud.webhooks.taxes.create\"|\"it.fattureincloud.webhooks.taxes.update\"|\"it.fattureincloud.webhooks.taxes.delete\"|\"it.fattureincloud.webhooks.archive_documents.create\"|\"it.fattureincloud.webhooks.archive_documents.update\"|\"it.fattureincloud.webhooks.archive_documents.delete\"|\"it.fattureincloud.webhooks.cashbook.create\"|\"it.fattureincloud.webhooks.cashbook.update\"|\"it.fattureincloud.webhooks.cashbook.delete\"|\"it.fattureincloud.webhooks.products.create\"|\"it.fattureincloud.webhooks.products.update\"|\"it.fattureincloud.webhooks.products.delete\"|\"it.fattureincloud.webhooks.products.stock_update\"|\"it.fattureincloud.webhooks.entities.clients.create\"|\"it.fattureincloud.webhooks.entities.clients.update\"|\"it.fattureincloud.webhooks.entities.clients.delete\"|\"it.fattureincloud.webhooks.entities.suppliers.create\"|\"it.fattureincloud.webhooks.entities.suppliers.update\"|\"it.fattureincloud.webhooks.entities.suppliers.delete\"|\"it.fattureincloud.webhooks.entities.all.create\"|\"it.fattureincloud.webhooks.entities.all.update\"|\"it.fattureincloud.webhooks.entities.all.delete\"|\"it.fattureincloud.webhooks.issued_documents.e_invoices.status_update\"|\"it.fattureincloud.webhooks.received_documents.e_invoices.receive\"|\"it.fattureincloud.webhooks.issued_documents.invoices.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.quotes.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.proformas.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.receipts.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.delivery_notes.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.credit_notes.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.orders.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.work_reports.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.supplier_orders.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.self_supplier_invoices.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.self_own_invoices.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.all.email_sent\"[]",
          "config": "object",
          "verification_method": "\"header\"|\"query\""
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "deleteArchiveDocument",
    "method": "DELETE",
    "path": "/c/{company_id}/archive/{document_id}",
    "tag": "Archive",
    "summary": "Delete Archive Document",
    "effect": "delete",
    "scopes": [
      "archive:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "DeleteBinIssuedDocument",
    "method": "DELETE",
    "path": "/c/{company_id}/bin/issued_documents/{document_id}",
    "tag": "Issued Documents",
    "summary": "Delete Bin Issued Document",
    "effect": "delete_permanent",
    "scopes": [
      "issued_documents.{tipo}:a"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "DeleteBinReceivedDocument",
    "method": "DELETE",
    "path": "/c/{company_id}/bin/received_documents/{document_id}",
    "tag": "Received Documents",
    "summary": "Delete Bin Received Document",
    "effect": "delete_permanent",
    "scopes": [
      "received_documents:a"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "deleteCashbookEntry",
    "method": "DELETE",
    "path": "/c/{company_id}/cashbook/{document_id}",
    "tag": "Cashbook",
    "summary": "Delete Cashbook Entry",
    "effect": "delete",
    "scopes": [
      "cashbook:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "deleteClient",
    "method": "DELETE",
    "path": "/c/{company_id}/entities/clients/{client_id}",
    "tag": "Clients",
    "summary": "Delete Client",
    "effect": "delete",
    "scopes": [
      "entity.clients:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "client_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "deleteF24",
    "method": "DELETE",
    "path": "/c/{company_id}/taxes/{document_id}",
    "tag": "Taxes",
    "summary": "Delete F24",
    "effect": "delete",
    "scopes": [
      "taxes:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "deleteF24Attachment",
    "method": "DELETE",
    "path": "/c/{company_id}/taxes/{document_id}/attachment",
    "tag": "Taxes",
    "summary": "Delete F24 Attachment",
    "effect": "delete",
    "scopes": [
      "taxes:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "deleteIssuedDocument",
    "method": "DELETE",
    "path": "/c/{company_id}/issued_documents/{document_id}",
    "tag": "Issued Documents",
    "summary": "Delete Issued Document",
    "effect": "delete",
    "scopes": [
      "issued_documents.{tipo}:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "deleteIssuedDocumentAttachment",
    "method": "DELETE",
    "path": "/c/{company_id}/issued_documents/{document_id}/attachment",
    "tag": "Issued Documents",
    "summary": "Delete Issued Document Attachment",
    "effect": "delete",
    "scopes": [
      "issued_documents.{tipo}:a"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "deletePaymentAccount",
    "method": "DELETE",
    "path": "/c/{company_id}/settings/payment_accounts/{payment_account_id}",
    "tag": "Settings",
    "summary": "Delete Payment Account",
    "effect": "delete",
    "scopes": [
      "settings:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "payment_account_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "deletePaymentMethod",
    "method": "DELETE",
    "path": "/c/{company_id}/settings/payment_methods/{payment_method_id}",
    "tag": "Settings",
    "summary": "Delete Payment Method",
    "effect": "delete",
    "scopes": [
      "settings:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "payment_method_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "deleteProduct",
    "method": "DELETE",
    "path": "/c/{company_id}/products/{product_id}",
    "tag": "Products",
    "summary": "Delete Product",
    "effect": "delete",
    "scopes": [
      "products:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "product_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "deleteReceipt",
    "method": "DELETE",
    "path": "/c/{company_id}/receipts/{document_id}",
    "tag": "Receipts",
    "summary": "Delete Receipt",
    "effect": "delete",
    "scopes": [
      "receipts:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "deleteReceivedDocument",
    "method": "DELETE",
    "path": "/c/{company_id}/received_documents/{document_id}",
    "tag": "Received Documents",
    "summary": "Delete Received Document",
    "effect": "delete",
    "scopes": [
      "received_documents:a",
      "stock:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "deleteReceivedDocumentAttachment",
    "method": "DELETE",
    "path": "/c/{company_id}/received_documents/{document_id}/attachment",
    "tag": "Received Documents",
    "summary": "Delete Received Document Attachment",
    "effect": "delete",
    "scopes": [
      "received_documents:a",
      "stock:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "deleteSupplier",
    "method": "DELETE",
    "path": "/c/{company_id}/entities/suppliers/{supplier_id}",
    "tag": "Suppliers",
    "summary": "Delete Supplier",
    "effect": "delete",
    "scopes": [
      "entity.suppliers:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "supplier_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "deleteVatType",
    "method": "DELETE",
    "path": "/c/{company_id}/settings/vat_types/{vat_type_id}",
    "tag": "Settings",
    "summary": "Delete Vat Type",
    "effect": "delete",
    "scopes": [
      "settings:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "vat_type_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "deleteWebhooksSubscription",
    "method": "DELETE",
    "path": "/c/{company_id}/subscriptions/{subscription_id}",
    "tag": "Webhooks",
    "summary": "Delete Webhooks Subscription",
    "effect": "delete",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "subscription_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "getArchiveDocument",
    "method": "GET",
    "path": "/c/{company_id}/archive/{document_id}",
    "tag": "Archive",
    "summary": "Get Archive Document",
    "effect": "read",
    "scopes": [
      "archive:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "GetBinIssuedDocument",
    "method": "GET",
    "path": "/c/{company_id}/bin/issued_documents/{document_id}",
    "tag": "Issued Documents",
    "summary": "Get Bin Issued Documents List",
    "effect": "read",
    "scopes": [
      "issued_documents.{tipo}:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "GetBinReceivedDocument",
    "method": "GET",
    "path": "/c/{company_id}/bin/received_documents/{document_id}",
    "tag": "Received Documents",
    "summary": "Get Bin Received Documents List",
    "effect": "read",
    "scopes": [
      "received_documents:r"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getCashbookEntry",
    "method": "GET",
    "path": "/c/{company_id}/cashbook/{document_id}",
    "tag": "Cashbook",
    "summary": "Get Cashbook Entry",
    "effect": "read",
    "scopes": [
      "cashbook:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getClient",
    "method": "GET",
    "path": "/c/{company_id}/entities/clients/{client_id}",
    "tag": "Clients",
    "summary": "Get Client",
    "effect": "read",
    "scopes": [
      "entity.clients:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "client_id"
    ],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getClientInfo",
    "method": "GET",
    "path": "/c/{company_id}/entities/clients/info",
    "tag": "Clients",
    "summary": "Get Client info",
    "effect": "read",
    "scopes": [
      "entity.clients:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getCompanyInfo",
    "method": "GET",
    "path": "/c/{company_id}/company/info",
    "tag": "Companies",
    "summary": "Get Company Info",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getCompanyPlanUsage",
    "method": "GET",
    "path": "/c/{company_id}/company/plan_usage",
    "tag": "Companies",
    "summary": "Get Company Plan Usage",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "category",
        "type": "\"clients\"|\"suppliers\"|\"products\"|\"documents\"",
        "required": true,
        "enum": [
          "clients",
          "suppliers",
          "products",
          "documents"
        ],
        "description": "Category"
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getEInvoiceRejectionReason",
    "method": "GET",
    "path": "/c/{company_id}/issued_documents/{document_id}/e_invoice/error_reason",
    "tag": "Issued e-invoices",
    "summary": "Get E-Invoice Rejection Reason",
    "effect": "read",
    "scopes": [
      "issued_documents.{tipo}:r"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getEInvoiceXml",
    "method": "GET",
    "path": "/c/{company_id}/issued_documents/{document_id}/e_invoice/xml",
    "tag": "Issued e-invoices",
    "summary": "Get E-Invoice XML",
    "effect": "read",
    "scopes": [
      "issued_documents.{tipo}:r"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [
      {
        "name": "include_attachment",
        "type": "boolean",
        "required": false,
        "description": "Include the attachment to the XML e-invoice."
      }
    ],
    "paginated": false,
    "responseType": "text/xml"
  },
  {
    "id": "getEmailData",
    "method": "GET",
    "path": "/c/{company_id}/issued_documents/{document_id}/email",
    "tag": "Issued Documents",
    "summary": "Get Email Data",
    "effect": "read",
    "scopes": [
      "issued_documents.{tipo}:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getExistingIssuedDocumentTotals",
    "method": "POST",
    "path": "/c/{company_id}/issued_documents/{document_id}/totals",
    "tag": "Issued Documents",
    "summary": "Get Existing Issued Document Totals",
    "effect": "read",
    "scopes": [
      "issued_documents.{tipo}:a"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "entity": "object",
          "type": "\"invoice\"|\"quote\"|\"proforma\"|\"receipt\"|\"delivery_note\"|\"credit_note\"|\"order\"|\"work_report\"|\"supplier_order\"|\"self_own_invoice\"|\"self_supplier_invoice\"",
          "number": "integer",
          "numeration": "string",
          "date": "string",
          "year": "integer",
          "currency": "object",
          "language": "object",
          "subject": "string",
          "visible_subject": "string",
          "rc_center": "string",
          "notes": "string",
          "rivalsa": "number",
          "cassa": "number",
          "cassa_taxable": "number",
          "amount_cassa_taxable": "number",
          "cassa2": "number",
          "cassa2_taxable": "number",
          "amount_cassa2_taxable": "number",
          "global_cassa_taxable": "number",
          "amount_global_cassa_taxable": "number",
          "withholding_tax": "number",
          "withholding_tax_taxable": "number",
          "other_withholding_tax": "number",
          "stamp_duty": "number",
          "payment_method": "object",
          "use_split_payment": "boolean",
          "use_gross_prices": "boolean",
          "e_invoice": "boolean",
          "ei_data": "object",
          "ei_cassa_type": "string",
          "ei_cassa2_type": "string",
          "ei_withholding_tax_causal": "string",
          "ei_other_withholding_tax_type": "string",
          "ei_other_withholding_tax_causal": "string",
          "items_list": "object[]",
          "payments_list": "object[]",
          "template": "object",
          "delivery_note_template": "object",
          "acc_inv_template": "object",
          "h_margins": "integer",
          "v_margins": "integer",
          "show_payments": "boolean",
          "show_payment_method": "boolean",
          "show_totals": "\"none\"|\"nets\"|\"all\"",
          "show_notification_button": "boolean",
          "show_tspay_button": "boolean",
          "delivery_note": "boolean",
          "accompanying_invoice": "boolean",
          "dn_number": "integer",
          "dn_date": "string",
          "dn_ai_packages_number": "string",
          "dn_ai_weight": "string",
          "dn_ai_causal": "string",
          "dn_ai_destination": "string",
          "dn_ai_transporter": "string",
          "dn_ai_notes": "string",
          "is_marked": "boolean",
          "amount_due_discount": "number",
          "amount_rivalsa_taxable": "number",
          "amount_withholding_tax_taxable": "number",
          "amount_other_withholding_tax_taxable": "number",
          "amount_enasarco_taxable": "number",
          "extra_data": "object",
          "seen_date": "string",
          "next_due_date": "string",
          "url": "string",
          "dn_url": "string",
          "ai_url": "string",
          "attachment_token": "string",
          "ei_raw": "object",
          "ei_status": "\"attempt\"|\"missing\"|\"not_sent\"|\"sent\"|\"pending\"|\"processing\"|\"error\"|\"discarded\"|\"not_delivered\"|\"accepted\"|\"rejected\"|\"no_response\"|\"manual_accepted\"|\"manual_rejected\"",
          "price_list_id": "string",
          "locked": "boolean",
          "created_at": "string",
          "updated_at": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getExistingReceivedDocumentTotals",
    "method": "POST",
    "path": "/c/{company_id}/received_documents/{document_id}/totals",
    "tag": "Received Documents",
    "summary": "Get Existing Received Document Totals",
    "effect": "read",
    "scopes": [
      "received_documents:a",
      "stock:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "type": "\"expense\"|\"passive_credit_note\"|\"passive_delivery_note\"|\"self_invoice\"",
          "entity": "object",
          "date": "string",
          "category": "string",
          "description": "string",
          "amount_net": "number",
          "amount_vat": "number",
          "amount_withholding_tax": "number",
          "amount_other_withholding_tax": "number",
          "amortization": "number",
          "rc_center": "string",
          "invoice_number": "string",
          "is_marked": "boolean",
          "is_detailed": "boolean",
          "e_invoice": "boolean",
          "currency": "object",
          "tax_deductibility": "number",
          "vat_deductibility": "number",
          "items_list": "object[]",
          "payments_list": "object[]",
          "auto_calculate": "boolean",
          "attachment_token": "string",
          "locked": "boolean",
          "created_at": "string",
          "updated_at": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getF24",
    "method": "GET",
    "path": "/c/{company_id}/taxes/{document_id}",
    "tag": "Taxes",
    "summary": "Get F24",
    "effect": "read",
    "scopes": [
      "taxes:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getIssuedDocument",
    "method": "GET",
    "path": "/c/{company_id}/issued_documents/{document_id}",
    "tag": "Issued Documents",
    "summary": "Get Issued Document",
    "effect": "read",
    "scopes": [
      "issued_documents.{tipo}:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getIssuedDocumentPreCreateInfo",
    "method": "GET",
    "path": "/c/{company_id}/issued_documents/info",
    "tag": "Issued Documents",
    "summary": "Get Issued Document Pre-Create Info",
    "effect": "read",
    "scopes": [
      "issued_documents.{tipo}:a"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "type",
        "type": "\"invoice\"|\"quote\"|\"proforma\"|\"receipt\"|\"delivery_note\"|\"credit_note\"|\"order\"|\"work_report\"|\"supplier_order\"|\"self_own_invoice\"|\"self_supplier_invoice\"",
        "required": true,
        "enum": [
          "invoice",
          "quote",
          "proforma",
          "receipt",
          "delivery_note",
          "credit_note",
          "order",
          "work_report",
          "supplier_order",
          "self_own_invoice",
          "self_supplier_invoice"
        ],
        "description": "The type of the issued document."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getNewIssuedDocumentTotals",
    "method": "POST",
    "path": "/c/{company_id}/issued_documents/totals",
    "tag": "Issued Documents",
    "summary": "Get New Issued Document Totals",
    "effect": "read",
    "scopes": [
      "issued_documents.{tipo}:a"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "entity": "object",
          "type": "\"invoice\"|\"quote\"|\"proforma\"|\"receipt\"|\"delivery_note\"|\"credit_note\"|\"order\"|\"work_report\"|\"supplier_order\"|\"self_own_invoice\"|\"self_supplier_invoice\"",
          "number": "integer",
          "numeration": "string",
          "date": "string",
          "year": "integer",
          "currency": "object",
          "language": "object",
          "subject": "string",
          "visible_subject": "string",
          "rc_center": "string",
          "notes": "string",
          "rivalsa": "number",
          "cassa": "number",
          "cassa_taxable": "number",
          "amount_cassa_taxable": "number",
          "cassa2": "number",
          "cassa2_taxable": "number",
          "amount_cassa2_taxable": "number",
          "global_cassa_taxable": "number",
          "amount_global_cassa_taxable": "number",
          "withholding_tax": "number",
          "withholding_tax_taxable": "number",
          "other_withholding_tax": "number",
          "stamp_duty": "number",
          "payment_method": "object",
          "use_split_payment": "boolean",
          "use_gross_prices": "boolean",
          "e_invoice": "boolean",
          "ei_data": "object",
          "ei_cassa_type": "string",
          "ei_cassa2_type": "string",
          "ei_withholding_tax_causal": "string",
          "ei_other_withholding_tax_type": "string",
          "ei_other_withholding_tax_causal": "string",
          "items_list": "object[]",
          "payments_list": "object[]",
          "template": "object",
          "delivery_note_template": "object",
          "acc_inv_template": "object",
          "h_margins": "integer",
          "v_margins": "integer",
          "show_payments": "boolean",
          "show_payment_method": "boolean",
          "show_totals": "\"none\"|\"nets\"|\"all\"",
          "show_notification_button": "boolean",
          "show_tspay_button": "boolean",
          "delivery_note": "boolean",
          "accompanying_invoice": "boolean",
          "dn_number": "integer",
          "dn_date": "string",
          "dn_ai_packages_number": "string",
          "dn_ai_weight": "string",
          "dn_ai_causal": "string",
          "dn_ai_destination": "string",
          "dn_ai_transporter": "string",
          "dn_ai_notes": "string",
          "is_marked": "boolean",
          "amount_due_discount": "number",
          "amount_rivalsa_taxable": "number",
          "amount_withholding_tax_taxable": "number",
          "amount_other_withholding_tax_taxable": "number",
          "amount_enasarco_taxable": "number",
          "extra_data": "object",
          "seen_date": "string",
          "next_due_date": "string",
          "url": "string",
          "dn_url": "string",
          "ai_url": "string",
          "attachment_token": "string",
          "ei_raw": "object",
          "ei_status": "\"attempt\"|\"missing\"|\"not_sent\"|\"sent\"|\"pending\"|\"processing\"|\"error\"|\"discarded\"|\"not_delivered\"|\"accepted\"|\"rejected\"|\"no_response\"|\"manual_accepted\"|\"manual_rejected\"",
          "price_list_id": "string",
          "locked": "boolean",
          "created_at": "string",
          "updated_at": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getNewReceivedDocumentTotals",
    "method": "POST",
    "path": "/c/{company_id}/received_documents/totals",
    "tag": "Received Documents",
    "summary": "Get New Received Document Totals",
    "effect": "read",
    "scopes": [
      "received_documents:a",
      "stock:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "type": "\"expense\"|\"passive_credit_note\"|\"passive_delivery_note\"|\"self_invoice\"",
          "entity": "object",
          "date": "string",
          "category": "string",
          "description": "string",
          "amount_net": "number",
          "amount_vat": "number",
          "amount_withholding_tax": "number",
          "amount_other_withholding_tax": "number",
          "amortization": "number",
          "rc_center": "string",
          "invoice_number": "string",
          "is_marked": "boolean",
          "is_detailed": "boolean",
          "e_invoice": "boolean",
          "currency": "object",
          "tax_deductibility": "number",
          "vat_deductibility": "number",
          "items_list": "object[]",
          "payments_list": "object[]",
          "auto_calculate": "boolean",
          "attachment_token": "string",
          "locked": "boolean",
          "created_at": "string",
          "updated_at": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getPaymentAccount",
    "method": "GET",
    "path": "/c/{company_id}/settings/payment_accounts/{payment_account_id}",
    "tag": "Settings",
    "summary": "Get Payment Account",
    "effect": "read",
    "scopes": [
      "settings:r"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "payment_account_id"
    ],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getPaymentMethod",
    "method": "GET",
    "path": "/c/{company_id}/settings/payment_methods/{payment_method_id}",
    "tag": "Settings",
    "summary": "Get Payment Method",
    "effect": "read",
    "scopes": [
      "settings:r"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "payment_method_id"
    ],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getPendingReceivedDocument",
    "method": "GET",
    "path": "/c/{company_id}/received_documents/pending/{document_id}",
    "tag": "Received Documents",
    "summary": "Get Pending Received Document",
    "effect": "read",
    "scopes": [
      "received_documents:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getPriceListItems",
    "method": "GET",
    "path": "/c/{company_id}/price_lists/{price_list_id}/items",
    "tag": "PriceLists",
    "summary": "Get PriceList Items List",
    "effect": "read",
    "scopes": [
      "products:r"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "price_list_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getPriceLists",
    "method": "GET",
    "path": "/c/{company_id}/price_lists",
    "tag": "PriceLists",
    "summary": "Get PriceLists",
    "effect": "read",
    "scopes": [
      "products:r"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getProduct",
    "method": "GET",
    "path": "/c/{company_id}/products/{product_id}",
    "tag": "Products",
    "summary": "Get Product",
    "effect": "read",
    "scopes": [
      "products:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "product_id"
    ],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getReceipt",
    "method": "GET",
    "path": "/c/{company_id}/receipts/{document_id}",
    "tag": "Receipts",
    "summary": "Get Receipt",
    "effect": "read",
    "scopes": [
      "receipts:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getReceiptPreCreateInfo",
    "method": "GET",
    "path": "/c/{company_id}/receipts/info",
    "tag": "Receipts",
    "summary": "Get Receipt Pre-Create Info",
    "effect": "read",
    "scopes": [
      "receipts:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getReceiptsMonthlyTotals",
    "method": "GET",
    "path": "/c/{company_id}/receipts/monthly_totals",
    "tag": "Receipts",
    "summary": "Get Receipts Monthly Totals",
    "effect": "read",
    "scopes": [
      "receipts:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "type",
        "type": "\"sales_receipt\"|\"till_receipt\"",
        "required": true,
        "enum": [
          "sales_receipt",
          "till_receipt"
        ],
        "description": "Receipt Type"
      },
      {
        "name": "year",
        "type": "string",
        "required": true,
        "description": "Year for which you want monthly totals"
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getReceivedDocument",
    "method": "GET",
    "path": "/c/{company_id}/received_documents/{document_id}",
    "tag": "Received Documents",
    "summary": "Get Received Document",
    "effect": "read",
    "scopes": [
      "received_documents:r",
      "stock:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getReceivedDocumentPreCreateInfo",
    "method": "GET",
    "path": "/c/{company_id}/received_documents/info",
    "tag": "Received Documents",
    "summary": "Get Received Document Pre-Create Info",
    "effect": "read",
    "scopes": [
      "received_documents:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "type",
        "type": "\"expense\"|\"passive_credit_note\"|\"passive_delivery_note\"|\"self_invoice\"",
        "required": true,
        "enum": [
          "expense",
          "passive_credit_note",
          "passive_delivery_note",
          "self_invoice"
        ],
        "description": "The type of the received document."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getSupplier",
    "method": "GET",
    "path": "/c/{company_id}/entities/suppliers/{supplier_id}",
    "tag": "Suppliers",
    "summary": "Get Supplier",
    "effect": "read",
    "scopes": [
      "entity.suppliers:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "supplier_id"
    ],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getTaxProfile",
    "method": "GET",
    "path": "/c/{company_id}/settings/tax_profile",
    "tag": "Settings",
    "summary": "Get Tax Profile",
    "effect": "read",
    "scopes": [
      "settings:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getTemplate",
    "method": "GET",
    "path": "/c/{company_id}/settings/templates/{template_id}",
    "tag": "Settings",
    "summary": "Get Template",
    "effect": "read",
    "scopes": [
      "settings:r"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "template_id"
    ],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getUserInfo",
    "method": "GET",
    "path": "/user/info",
    "tag": "User",
    "summary": "Get User Info",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": false,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getVatType",
    "method": "GET",
    "path": "/c/{company_id}/settings/vat_types/{vat_type_id}",
    "tag": "Settings",
    "summary": "Get Vat Type",
    "effect": "read",
    "scopes": [
      "settings:r"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "vat_type_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "getWebhooksSubscription",
    "method": "GET",
    "path": "/c/{company_id}/subscriptions/{subscription_id}",
    "tag": "Webhooks",
    "summary": "Get Webhooks Subscription",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "subscription_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "joinIssuedDocuments",
    "method": "GET",
    "path": "/c/{company_id}/issued_documents/join",
    "tag": "Issued Documents",
    "summary": "Join Issued Documents",
    "effect": "read",
    "scopes": [
      "issued_documents.{tipo}:a"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "ids",
        "type": "string",
        "required": true,
        "description": "Ids of the documents."
      },
      {
        "name": "group",
        "type": "0|1",
        "required": false,
        "enum": [
          0,
          1
        ],
        "description": "Group items."
      },
      {
        "name": "type",
        "type": "\"delivery_notes\"|\"orders\"|\"quotes\"|\"work_reports\"",
        "required": false,
        "enum": [
          "delivery_notes",
          "orders",
          "quotes",
          "work_reports"
        ],
        "description": "Type of the documents to be joined"
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listArchiveCategories",
    "method": "GET",
    "path": "/c/{company_id}/info/archive_categories",
    "tag": "Info",
    "summary": "List Archive Categories",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listArchiveDocuments",
    "method": "GET",
    "path": "/c/{company_id}/archive",
    "tag": "Archive",
    "summary": "List Archive Documents",
    "effect": "read",
    "scopes": [
      "archive:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      },
      {
        "name": "sort",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields for result sorting (minus for desc sorting)."
      },
      {
        "name": "page",
        "type": "integer",
        "required": false,
        "description": "The page to retrieve."
      },
      {
        "name": "per_page",
        "type": "integer",
        "required": false,
        "max": 100,
        "description": "The size of the page."
      },
      {
        "name": "q",
        "type": "string",
        "required": false,
        "description": "Query for filtering the results."
      }
    ],
    "paginated": true,
    "responseType": "application/json"
  },
  {
    "id": "ListBinIssuedDocuments",
    "method": "GET",
    "path": "/c/{company_id}/bin/issued_documents",
    "tag": "Issued Documents",
    "summary": "Get Bin Issued Documents List",
    "effect": "read",
    "scopes": [
      "issued_documents.{tipo}:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "ListBinReceivedDocuments",
    "method": "GET",
    "path": "/c/{company_id}/bin/received_documents",
    "tag": "Received Documents",
    "summary": "Get Bin Received Documents List",
    "effect": "read",
    "scopes": [
      "received_documents:r"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listCashbookEntries",
    "method": "GET",
    "path": "/c/{company_id}/cashbook",
    "tag": "Cashbook",
    "summary": "List Cashbook Entries",
    "effect": "read",
    "scopes": [
      "cashbook:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "date_from",
        "type": "string",
        "required": true,
        "description": "Start date."
      },
      {
        "name": "date_to",
        "type": "string",
        "required": true,
        "description": "End date."
      },
      {
        "name": "year",
        "type": "integer",
        "required": false,
        "description": "Filter cashbook by year."
      },
      {
        "name": "type",
        "type": "\"all\"|\"in\"|\"out\"",
        "required": false,
        "enum": [
          "all",
          "in",
          "out"
        ],
        "description": "Filter cashbook by type."
      },
      {
        "name": "payment_account_id",
        "type": "integer",
        "required": false,
        "description": "Filter by payment account."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listCities",
    "method": "GET",
    "path": "/info/cities",
    "tag": "Info",
    "summary": "List Cities",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": false,
    "pathParams": [],
    "query": [
      {
        "name": "postal_code",
        "type": "string",
        "required": false,
        "description": "Postal code for filtering."
      },
      {
        "name": "city",
        "type": "string",
        "required": false,
        "description": "City for filtering (ignored if postal_code is passed)."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listClients",
    "method": "GET",
    "path": "/c/{company_id}/entities/clients",
    "tag": "Clients",
    "summary": "List Clients",
    "effect": "read",
    "scopes": [
      "entity.clients:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      },
      {
        "name": "sort",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields for result sorting (minus for desc sorting)."
      },
      {
        "name": "page",
        "type": "integer",
        "required": false,
        "description": "The page to retrieve."
      },
      {
        "name": "per_page",
        "type": "integer",
        "required": false,
        "max": 100,
        "description": "The size of the page."
      },
      {
        "name": "q",
        "type": "string",
        "required": false,
        "description": "Query for filtering the results."
      }
    ],
    "paginated": true,
    "responseType": "application/json"
  },
  {
    "id": "listCostCenters",
    "method": "GET",
    "path": "/c/{company_id}/info/cost_centers",
    "tag": "Info",
    "summary": "List Cost Centers",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listCountries",
    "method": "GET",
    "path": "/info/countries",
    "tag": "Info",
    "summary": "List Countries",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": false,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listCurrencies",
    "method": "GET",
    "path": "/info/currencies",
    "tag": "Info",
    "summary": "List Currencies",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": false,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listDefaultTemplates",
    "method": "GET",
    "path": "/info/templates",
    "tag": "Info",
    "summary": "List Default Templates",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": false,
    "pathParams": [],
    "query": [
      {
        "name": "type",
        "type": "\"all\"|\"standard\"|\"delivery_note\"|\"accompanying_invoice\"",
        "required": false,
        "enum": [
          "all",
          "standard",
          "delivery_note",
          "accompanying_invoice"
        ],
        "description": "Type of the templates."
      },
      {
        "name": "by_type",
        "type": "boolean",
        "required": false,
        "description": "[Only if type=all] If true, splits the list in objects, grouping templates by type."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listDeliveryNotesDefaultCausals",
    "method": "GET",
    "path": "/info/dn_causals",
    "tag": "Info",
    "summary": "List Delivery Notes Default Causals",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": false,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listDetailedCountries",
    "method": "GET",
    "path": "/info/detailed_countries",
    "tag": "Info",
    "summary": "List Detailed Countries",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": false,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listEmails",
    "method": "GET",
    "path": "/c/{company_id}/emails",
    "tag": "Emails",
    "summary": "List Emails",
    "effect": "read",
    "scopes": [
      "emails:r"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      },
      {
        "name": "sort",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields for result sorting (minus for desc sorting)."
      },
      {
        "name": "page",
        "type": "integer",
        "required": false,
        "description": "The page to retrieve."
      },
      {
        "name": "per_page",
        "type": "integer",
        "required": false,
        "max": 100,
        "description": "The size of the page."
      },
      {
        "name": "q",
        "type": "string",
        "required": false,
        "description": "Query for filtering the results."
      }
    ],
    "paginated": true,
    "responseType": "application/json"
  },
  {
    "id": "listF24",
    "method": "GET",
    "path": "/c/{company_id}/taxes",
    "tag": "Taxes",
    "summary": "List F24",
    "effect": "read",
    "scopes": [
      "taxes:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      },
      {
        "name": "sort",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields for result sorting (minus for desc sorting)."
      },
      {
        "name": "page",
        "type": "integer",
        "required": false,
        "description": "The page to retrieve."
      },
      {
        "name": "per_page",
        "type": "integer",
        "required": false,
        "max": 100,
        "description": "The size of the page."
      },
      {
        "name": "q",
        "type": "string",
        "required": false,
        "description": "Query for filtering the results."
      }
    ],
    "paginated": true,
    "responseType": "application/json"
  },
  {
    "id": "listIssuedDocuments",
    "method": "GET",
    "path": "/c/{company_id}/issued_documents",
    "tag": "Issued Documents",
    "summary": "List Issued Documents",
    "effect": "read",
    "scopes": [
      "issued_documents.{tipo}:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "type",
        "type": "\"invoice\"|\"quote\"|\"proforma\"|\"receipt\"|\"delivery_note\"|\"credit_note\"|\"order\"|\"work_report\"|\"supplier_order\"|\"self_own_invoice\"|\"self_supplier_invoice\"",
        "required": true,
        "enum": [
          "invoice",
          "quote",
          "proforma",
          "receipt",
          "delivery_note",
          "credit_note",
          "order",
          "work_report",
          "supplier_order",
          "self_own_invoice",
          "self_supplier_invoice"
        ],
        "description": "The type of the issued document."
      },
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      },
      {
        "name": "sort",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields for result sorting (minus for desc sorting)."
      },
      {
        "name": "page",
        "type": "integer",
        "required": false,
        "description": "The page to retrieve."
      },
      {
        "name": "per_page",
        "type": "integer",
        "required": false,
        "max": 100,
        "description": "The size of the page."
      },
      {
        "name": "q",
        "type": "string",
        "required": false,
        "description": "Query for filtering the results."
      },
      {
        "name": "inclusive",
        "type": "0|1",
        "required": false,
        "enum": [
          0,
          1
        ],
        "description": "(Only for type = delivery_notes) Include invoices delivery notes."
      }
    ],
    "paginated": true,
    "responseType": "application/json"
  },
  {
    "id": "listLanguages",
    "method": "GET",
    "path": "/info/languages",
    "tag": "Info",
    "summary": "List Languages",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": false,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listPaymentAccounts",
    "method": "GET",
    "path": "/c/{company_id}/info/payment_accounts",
    "tag": "Info",
    "summary": "List Payment Accounts",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      },
      {
        "name": "sort",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields for result sorting (minus for desc sorting)."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listPaymentMethods",
    "method": "GET",
    "path": "/c/{company_id}/info/payment_methods",
    "tag": "Info",
    "summary": "List Payment Methods",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      },
      {
        "name": "sort",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields for result sorting (minus for desc sorting)."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listPendingReceivedDocuments",
    "method": "GET",
    "path": "/c/{company_id}/received_documents/pending",
    "tag": "Received Documents",
    "summary": "List Pending Received Documents",
    "effect": "read",
    "scopes": [
      "received_documents:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "type",
        "type": "\"agyo\"|\"mail\"|\"browser\"",
        "required": true,
        "enum": [
          "agyo",
          "mail",
          "browser"
        ],
        "description": "The type of the pending received document."
      },
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      },
      {
        "name": "sort",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields for result sorting (minus for desc sorting)."
      },
      {
        "name": "page",
        "type": "integer",
        "required": false,
        "description": "The page to retrieve."
      },
      {
        "name": "per_page",
        "type": "integer",
        "required": false,
        "max": 100,
        "description": "The size of the page."
      },
      {
        "name": "q",
        "type": "string",
        "required": false,
        "description": "Query for filtering the results."
      }
    ],
    "paginated": true,
    "responseType": "application/json"
  },
  {
    "id": "listProductCategories",
    "method": "GET",
    "path": "/c/{company_id}/info/product_categories",
    "tag": "Info",
    "summary": "List Product Categories",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "context",
        "type": "\"products\"|\"issued_documents\"|\"received_documents\"",
        "required": true,
        "enum": [
          "products",
          "issued_documents",
          "received_documents"
        ],
        "description": "Categories resource type."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listProducts",
    "method": "GET",
    "path": "/c/{company_id}/products",
    "tag": "Products",
    "summary": "List Products",
    "effect": "read",
    "scopes": [
      "products:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      },
      {
        "name": "sort",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields for result sorting (minus for desc sorting)."
      },
      {
        "name": "page",
        "type": "integer",
        "required": false,
        "description": "The page to retrieve."
      },
      {
        "name": "per_page",
        "type": "integer",
        "required": false,
        "max": 100,
        "description": "The size of the page."
      },
      {
        "name": "q",
        "type": "string",
        "required": false,
        "description": "Query for filtering the results."
      }
    ],
    "paginated": true,
    "responseType": "application/json"
  },
  {
    "id": "listReceipts",
    "method": "GET",
    "path": "/c/{company_id}/receipts",
    "tag": "Receipts",
    "summary": "List Receipts",
    "effect": "read",
    "scopes": [
      "receipts:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      },
      {
        "name": "page",
        "type": "integer",
        "required": false,
        "description": "The page to retrieve."
      },
      {
        "name": "per_page",
        "type": "integer",
        "required": false,
        "max": 100,
        "description": "The size of the page."
      },
      {
        "name": "sort",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields for result sorting (minus for desc sorting)."
      },
      {
        "name": "q",
        "type": "string",
        "required": false,
        "description": "Query for filtering the results."
      }
    ],
    "paginated": true,
    "responseType": "application/json"
  },
  {
    "id": "listReceivedDocumentCategories",
    "method": "GET",
    "path": "/c/{company_id}/info/received_document_categories",
    "tag": "Info",
    "summary": "List Received Document Categories",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listReceivedDocuments",
    "method": "GET",
    "path": "/c/{company_id}/received_documents",
    "tag": "Received Documents",
    "summary": "List Received Documents",
    "effect": "read",
    "scopes": [
      "received_documents:r",
      "stock:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "type",
        "type": "\"expense\"|\"passive_credit_note\"|\"passive_delivery_note\"|\"self_invoice\"",
        "required": true,
        "enum": [
          "expense",
          "passive_credit_note",
          "passive_delivery_note",
          "self_invoice"
        ],
        "description": "The type of the received document."
      },
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      },
      {
        "name": "sort",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields for result sorting (minus for desc sorting)."
      },
      {
        "name": "page",
        "type": "integer",
        "required": false,
        "description": "The page to retrieve."
      },
      {
        "name": "per_page",
        "type": "integer",
        "required": false,
        "max": 100,
        "description": "The size of the page."
      },
      {
        "name": "q",
        "type": "string",
        "required": false,
        "description": "Query for filtering the results."
      }
    ],
    "paginated": true,
    "responseType": "application/json"
  },
  {
    "id": "listRevenueCenters",
    "method": "GET",
    "path": "/c/{company_id}/info/revenue_centers",
    "tag": "Info",
    "summary": "List Revenue Centers",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listSuppliers",
    "method": "GET",
    "path": "/c/{company_id}/entities/suppliers",
    "tag": "Suppliers",
    "summary": "List Suppliers",
    "effect": "read",
    "scopes": [
      "entity.suppliers:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      },
      {
        "name": "sort",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields for result sorting (minus for desc sorting)."
      },
      {
        "name": "page",
        "type": "integer",
        "required": false,
        "description": "The page to retrieve."
      },
      {
        "name": "per_page",
        "type": "integer",
        "required": false,
        "max": 100,
        "description": "The size of the page."
      },
      {
        "name": "q",
        "type": "string",
        "required": false,
        "description": "Query for filtering the results."
      }
    ],
    "paginated": true,
    "responseType": "application/json"
  },
  {
    "id": "listTemplates",
    "method": "GET",
    "path": "/c/{company_id}/settings/templates",
    "tag": "Settings",
    "summary": "List Templates",
    "effect": "read",
    "scopes": [
      "settings:r"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "fields",
        "type": "string",
        "required": false,
        "description": "List of comma-separated fields."
      },
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listUnitsOfMeasure",
    "method": "GET",
    "path": "/info/measures",
    "tag": "Info",
    "summary": "List Units of Measure",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": false,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listUserCompanies",
    "method": "GET",
    "path": "/user/companies",
    "tag": "User",
    "summary": "List User Companies",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": false,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listVatTypes",
    "method": "GET",
    "path": "/c/{company_id}/info/vat_types",
    "tag": "Info",
    "summary": "List Vat Types",
    "effect": "read",
    "scopes": [
      "settings:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "fieldset",
        "type": "\"basic\"|\"detailed\"|\"fic_view\"",
        "required": false,
        "enum": [
          "basic",
          "detailed",
          "fic_view"
        ],
        "description": "Name of the fieldset."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "listWebhooksSubscriptions",
    "method": "GET",
    "path": "/c/{company_id}/subscriptions",
    "tag": "Webhooks",
    "summary": "List Webhooks Subscriptions",
    "effect": "read",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "modifyArchiveDocument",
    "method": "PUT",
    "path": "/c/{company_id}/archive/{document_id}",
    "tag": "Archive",
    "summary": "Modify Archive Document",
    "effect": "write",
    "scopes": [
      "archive:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "date": "string",
          "description": "string",
          "category": "string",
          "attachment_token": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "modifyCashbookEntry",
    "method": "PUT",
    "path": "/c/{company_id}/cashbook/{document_id}",
    "tag": "Cashbook",
    "summary": "Modify Cashbook Entry",
    "effect": "write",
    "scopes": [
      "cashbook:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "string",
          "date": "string",
          "description": "string",
          "kind": "\"cashbook\"|\"issued_document\"|\"received_document\"|\"tax\"|\"receipt\"|\"ts_pay\"",
          "type": "\"in\"|\"out\"",
          "entity_name": "string",
          "document": "object",
          "amount_in": "number",
          "payment_account_in": "object",
          "amount_out": "number",
          "payment_account_out": "object"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "modifyClient",
    "method": "PUT",
    "path": "/c/{company_id}/entities/clients/{client_id}",
    "tag": "Clients",
    "summary": "Modify Client",
    "effect": "write",
    "scopes": [
      "entity.clients:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "client_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "code": "string",
          "name": "string",
          "type": "\"company\"|\"person\"|\"pa\"|\"condo\"",
          "first_name": "string",
          "last_name": "string",
          "contact_person": "string",
          "vat_number": "string",
          "tax_code": "string",
          "address_street": "string",
          "address_postal_code": "string",
          "address_city": "string",
          "address_province": "string",
          "address_extra": "string",
          "country": "string",
          "country_iso": "string",
          "email": "string",
          "certified_email": "string",
          "phone": "string",
          "fax": "string",
          "notes": "string",
          "default_vat": "object",
          "default_payment_terms": "integer",
          "default_payment_terms_type": "\"standard\"|\"end_of_month\"",
          "default_payment_method": "object",
          "bank_name": "string",
          "bank_iban": "string",
          "bank_swift_code": "string",
          "shipping_address": "string",
          "e_invoice": "boolean",
          "discount_highlight": "boolean",
          "ei_code": "string",
          "default_discount": "number",
          "has_intent_declaration": "boolean",
          "intent_declaration_protocol_number": "string",
          "intent_declaration_protocol_date": "string",
          "price_list_id": "string",
          "created_at": "string",
          "updated_at": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "modifyF24",
    "method": "PUT",
    "path": "/c/{company_id}/taxes/{document_id}",
    "tag": "Taxes",
    "summary": "Modify F24",
    "effect": "write",
    "scopes": [
      "taxes:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "due_date": "string",
          "status": "\"paid\"|\"not_paid\"|\"reversed\"",
          "payment_account": "object",
          "amount": "number",
          "attachment_token": "string",
          "description": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "modifyIssuedDocument",
    "method": "PUT",
    "path": "/c/{company_id}/issued_documents/{document_id}",
    "tag": "Issued Documents",
    "summary": "Modify Issued Document",
    "effect": "write",
    "scopes": [
      "issued_documents.{tipo}:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "entity": "object",
          "type": "\"invoice\"|\"quote\"|\"proforma\"|\"receipt\"|\"delivery_note\"|\"credit_note\"|\"order\"|\"work_report\"|\"supplier_order\"|\"self_own_invoice\"|\"self_supplier_invoice\"",
          "number": "integer",
          "numeration": "string",
          "date": "string",
          "year": "integer",
          "currency": "object",
          "language": "object",
          "subject": "string",
          "visible_subject": "string",
          "rc_center": "string",
          "notes": "string",
          "rivalsa": "number",
          "cassa": "number",
          "cassa_taxable": "number",
          "amount_cassa_taxable": "number",
          "cassa2": "number",
          "cassa2_taxable": "number",
          "amount_cassa2_taxable": "number",
          "global_cassa_taxable": "number",
          "amount_global_cassa_taxable": "number",
          "withholding_tax": "number",
          "withholding_tax_taxable": "number",
          "other_withholding_tax": "number",
          "stamp_duty": "number",
          "payment_method": "object",
          "use_split_payment": "boolean",
          "use_gross_prices": "boolean",
          "e_invoice": "boolean",
          "ei_data": "object",
          "ei_cassa_type": "string",
          "ei_cassa2_type": "string",
          "ei_withholding_tax_causal": "string",
          "ei_other_withholding_tax_type": "string",
          "ei_other_withholding_tax_causal": "string",
          "items_list": "object[]",
          "payments_list": "object[]",
          "template": "object",
          "delivery_note_template": "object",
          "acc_inv_template": "object",
          "h_margins": "integer",
          "v_margins": "integer",
          "show_payments": "boolean",
          "show_payment_method": "boolean",
          "show_totals": "\"none\"|\"nets\"|\"all\"",
          "show_notification_button": "boolean",
          "show_tspay_button": "boolean",
          "delivery_note": "boolean",
          "accompanying_invoice": "boolean",
          "dn_number": "integer",
          "dn_date": "string",
          "dn_ai_packages_number": "string",
          "dn_ai_weight": "string",
          "dn_ai_causal": "string",
          "dn_ai_destination": "string",
          "dn_ai_transporter": "string",
          "dn_ai_notes": "string",
          "is_marked": "boolean",
          "amount_due_discount": "number",
          "amount_rivalsa_taxable": "number",
          "amount_withholding_tax_taxable": "number",
          "amount_other_withholding_tax_taxable": "number",
          "amount_enasarco_taxable": "number",
          "extra_data": "object",
          "seen_date": "string",
          "next_due_date": "string",
          "url": "string",
          "dn_url": "string",
          "ai_url": "string",
          "attachment_token": "string",
          "ei_raw": "object",
          "ei_status": "\"attempt\"|\"missing\"|\"not_sent\"|\"sent\"|\"pending\"|\"processing\"|\"error\"|\"discarded\"|\"not_delivered\"|\"accepted\"|\"rejected\"|\"no_response\"|\"manual_accepted\"|\"manual_rejected\"",
          "price_list_id": "string",
          "locked": "boolean",
          "created_at": "string",
          "updated_at": "string"
        },
        "options": [
          "fix_payments",
          "create_from",
          "transform",
          "keep_copy",
          "join_type"
        ]
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "modifyPaymentAccount",
    "method": "PUT",
    "path": "/c/{company_id}/settings/payment_accounts/{payment_account_id}",
    "tag": "Settings",
    "summary": "Modify Payment Account",
    "effect": "write",
    "scopes": [
      "settings:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "payment_account_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "name": "string",
          "type": "\"standard\"|\"bank\"",
          "iban": "string",
          "sia": "string",
          "cuc": "string",
          "virtual": "boolean"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "modifyPaymentMethod",
    "method": "PUT",
    "path": "/c/{company_id}/settings/payment_methods/{payment_method_id}",
    "tag": "Settings",
    "summary": "Modify Payment Method",
    "effect": "write",
    "scopes": [
      "settings:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "payment_method_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "name": "string",
          "type": "\"standard\"|\"riba\"",
          "is_default": "boolean",
          "default_payment_account": "object",
          "details": "object[]",
          "bank_iban": "string",
          "bank_name": "string",
          "bank_beneficiary": "string",
          "ei_payment_method": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "modifyProduct",
    "method": "PUT",
    "path": "/c/{company_id}/products/{product_id}",
    "tag": "Products",
    "summary": "Modify Product",
    "effect": "write",
    "scopes": [
      "products:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "product_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "name": "string",
          "code": "string",
          "net_price": "number",
          "gross_price": "number",
          "use_gross_price": "boolean",
          "default_vat": "object",
          "net_cost": "number",
          "measure": "string",
          "description": "string",
          "category": "string",
          "notes": "string",
          "in_stock": "boolean",
          "stock_initial": "number",
          "average_cost": "number",
          "average_price": "number",
          "created_at": "string",
          "updated_at": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "modifyReceipt",
    "method": "PUT",
    "path": "/c/{company_id}/receipts/{document_id}",
    "tag": "Receipts",
    "summary": "Modify Receipt",
    "effect": "write",
    "scopes": [
      "receipts:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "date": "string",
          "number": "number",
          "numeration": "string",
          "amount_net": "number",
          "amount_vat": "number",
          "amount_gross": "number",
          "use_gross_prices": "boolean",
          "type": "\"till_receipt\"|\"sales_receipt\"",
          "description": "string",
          "rc_center": "string",
          "created_at": "string",
          "updated_at": "string",
          "payment_account": "object",
          "items_list": "object[]"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "modifyReceivedDocument",
    "method": "PUT",
    "path": "/c/{company_id}/received_documents/{document_id}",
    "tag": "Received Documents",
    "summary": "Modify Received Document",
    "effect": "write",
    "scopes": [
      "received_documents:a",
      "stock:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "type": "\"expense\"|\"passive_credit_note\"|\"passive_delivery_note\"|\"self_invoice\"",
          "entity": "object",
          "date": "string",
          "category": "string",
          "description": "string",
          "amount_net": "number",
          "amount_vat": "number",
          "amount_withholding_tax": "number",
          "amount_other_withholding_tax": "number",
          "amortization": "number",
          "rc_center": "string",
          "invoice_number": "string",
          "is_marked": "boolean",
          "is_detailed": "boolean",
          "e_invoice": "boolean",
          "currency": "object",
          "tax_deductibility": "number",
          "vat_deductibility": "number",
          "items_list": "object[]",
          "payments_list": "object[]",
          "auto_calculate": "boolean",
          "attachment_token": "string",
          "locked": "boolean",
          "created_at": "string",
          "updated_at": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "modifySupplier",
    "method": "PUT",
    "path": "/c/{company_id}/entities/suppliers/{supplier_id}",
    "tag": "Suppliers",
    "summary": "Modify Supplier",
    "effect": "write",
    "scopes": [
      "entity.suppliers:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "supplier_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "code": "string",
          "name": "string",
          "type": "\"company\"|\"person\"|\"pa\"|\"condo\"",
          "first_name": "string",
          "last_name": "string",
          "contact_person": "string",
          "vat_number": "string",
          "tax_code": "string",
          "address_street": "string",
          "address_postal_code": "string",
          "address_city": "string",
          "address_province": "string",
          "address_extra": "string",
          "country": "string",
          "country_iso": "string",
          "email": "string",
          "certified_email": "string",
          "phone": "string",
          "fax": "string",
          "notes": "string",
          "bank_iban": "string",
          "created_at": "string",
          "updated_at": "string"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "modifyVatType",
    "method": "PUT",
    "path": "/c/{company_id}/settings/vat_types/{vat_type_id}",
    "tag": "Settings",
    "summary": "Modify Vat Type",
    "effect": "write",
    "scopes": [
      "settings:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "vat_type_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "integer",
          "value": "number",
          "description": "string",
          "notes": "string",
          "e_invoice": "boolean",
          "ei_type": "string",
          "ei_description": "string",
          "is_disabled": "boolean",
          "default": "boolean"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "modifyWebhooksSubscription",
    "method": "PUT",
    "path": "/c/{company_id}/subscriptions/{subscription_id}",
    "tag": "Webhooks",
    "summary": "Modify Webhooks Subscription",
    "effect": "external",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "subscription_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "string",
          "sink": "string",
          "verified": "boolean",
          "types": "\"it.fattureincloud.webhooks.issued_documents.invoices.create\"|\"it.fattureincloud.webhooks.issued_documents.invoices.update\"|\"it.fattureincloud.webhooks.issued_documents.invoices.delete\"|\"it.fattureincloud.webhooks.issued_documents.quotes.create\"|\"it.fattureincloud.webhooks.issued_documents.quotes.update\"|\"it.fattureincloud.webhooks.issued_documents.quotes.delete\"|\"it.fattureincloud.webhooks.issued_documents.proformas.create\"|\"it.fattureincloud.webhooks.issued_documents.proformas.update\"|\"it.fattureincloud.webhooks.issued_documents.proformas.delete\"|\"it.fattureincloud.webhooks.issued_documents.receipts.create\"|\"it.fattureincloud.webhooks.issued_documents.receipts.update\"|\"it.fattureincloud.webhooks.issued_documents.receipts.delete\"|\"it.fattureincloud.webhooks.issued_documents.delivery_notes.create\"|\"it.fattureincloud.webhooks.issued_documents.delivery_notes.update\"|\"it.fattureincloud.webhooks.issued_documents.delivery_notes.delete\"|\"it.fattureincloud.webhooks.issued_documents.credit_notes.create\"|\"it.fattureincloud.webhooks.issued_documents.credit_notes.update\"|\"it.fattureincloud.webhooks.issued_documents.credit_notes.delete\"|\"it.fattureincloud.webhooks.issued_documents.orders.create\"|\"it.fattureincloud.webhooks.issued_documents.orders.update\"|\"it.fattureincloud.webhooks.issued_documents.orders.delete\"|\"it.fattureincloud.webhooks.issued_documents.work_reports.create\"|\"it.fattureincloud.webhooks.issued_documents.work_reports.update\"|\"it.fattureincloud.webhooks.issued_documents.work_reports.delete\"|\"it.fattureincloud.webhooks.issued_documents.supplier_orders.create\"|\"it.fattureincloud.webhooks.issued_documents.supplier_orders.update\"|\"it.fattureincloud.webhooks.issued_documents.supplier_orders.delete\"|\"it.fattureincloud.webhooks.issued_documents.self_supplier_invoices.create\"|\"it.fattureincloud.webhooks.issued_documents.self_supplier_invoices.update\"|\"it.fattureincloud.webhooks.issued_documents.self_supplier_invoices.delete\"|\"it.fattureincloud.webhooks.issued_documents.self_own_invoices.create\"|\"it.fattureincloud.webhooks.issued_documents.self_own_invoices.update\"|\"it.fattureincloud.webhooks.issued_documents.self_own_invoices.delete\"|\"it.fattureincloud.webhooks.issued_documents.all.create\"|\"it.fattureincloud.webhooks.issued_documents.all.update\"|\"it.fattureincloud.webhooks.issued_documents.all.delete\"|\"it.fattureincloud.webhooks.received_documents.create\"|\"it.fattureincloud.webhooks.received_documents.update\"|\"it.fattureincloud.webhooks.received_documents.delete\"|\"it.fattureincloud.webhooks.receipts.create\"|\"it.fattureincloud.webhooks.receipts.update\"|\"it.fattureincloud.webhooks.receipts.delete\"|\"it.fattureincloud.webhooks.taxes.create\"|\"it.fattureincloud.webhooks.taxes.update\"|\"it.fattureincloud.webhooks.taxes.delete\"|\"it.fattureincloud.webhooks.archive_documents.create\"|\"it.fattureincloud.webhooks.archive_documents.update\"|\"it.fattureincloud.webhooks.archive_documents.delete\"|\"it.fattureincloud.webhooks.cashbook.create\"|\"it.fattureincloud.webhooks.cashbook.update\"|\"it.fattureincloud.webhooks.cashbook.delete\"|\"it.fattureincloud.webhooks.products.create\"|\"it.fattureincloud.webhooks.products.update\"|\"it.fattureincloud.webhooks.products.delete\"|\"it.fattureincloud.webhooks.products.stock_update\"|\"it.fattureincloud.webhooks.entities.clients.create\"|\"it.fattureincloud.webhooks.entities.clients.update\"|\"it.fattureincloud.webhooks.entities.clients.delete\"|\"it.fattureincloud.webhooks.entities.suppliers.create\"|\"it.fattureincloud.webhooks.entities.suppliers.update\"|\"it.fattureincloud.webhooks.entities.suppliers.delete\"|\"it.fattureincloud.webhooks.entities.all.create\"|\"it.fattureincloud.webhooks.entities.all.update\"|\"it.fattureincloud.webhooks.entities.all.delete\"|\"it.fattureincloud.webhooks.issued_documents.e_invoices.status_update\"|\"it.fattureincloud.webhooks.received_documents.e_invoices.receive\"|\"it.fattureincloud.webhooks.issued_documents.invoices.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.quotes.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.proformas.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.receipts.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.delivery_notes.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.credit_notes.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.orders.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.work_reports.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.supplier_orders.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.self_supplier_invoices.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.self_own_invoices.email_sent\"|\"it.fattureincloud.webhooks.issued_documents.all.email_sent\"[]",
          "config": "object",
          "verification_method": "\"header\"|\"query\""
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "RecoverBinIssuedDocument",
    "method": "POST",
    "path": "/c/{company_id}/bin/issued_documents/{document_id}/recover",
    "tag": "Issued Documents",
    "summary": "Recover Issued Document From The Bin",
    "effect": "write",
    "scopes": [
      "issued_documents.{tipo}:a"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "RecoverBinReceivedDocument",
    "method": "POST",
    "path": "/c/{company_id}/bin/received_documents/{document_id}/recover",
    "tag": "Received Documents",
    "summary": "Recover Received Document From The Bin",
    "effect": "write",
    "scopes": [
      "received_documents:a"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": null
  },
  {
    "id": "scheduleEmail",
    "method": "POST",
    "path": "/c/{company_id}/issued_documents/{document_id}/email",
    "tag": "Issued Documents",
    "summary": "Schedule Email",
    "effect": "send",
    "scopes": [
      "issued_documents.{tipo}:r"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "sender_id": "integer",
          "sender_email": "string",
          "recipient_email": "string",
          "subject": "string",
          "body": "string",
          "include": "object",
          "attach_pdf": "boolean",
          "send_copy": "boolean"
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": null
  },
  {
    "id": "sendEInvoice",
    "method": "POST",
    "path": "/c/{company_id}/issued_documents/{document_id}/e_invoice/send",
    "tag": "Issued e-invoices",
    "summary": "Send E-Invoice",
    "effect": "send",
    "scopes": [
      "issued_documents.{tipo}:a"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "cassa_type": "string",
          "withholding_tax_causal": "string"
        },
        "options": [
          "dry_run"
        ]
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "transformIssuedDocument",
    "method": "GET",
    "path": "/c/{company_id}/issued_documents/transform",
    "tag": "Issued Documents",
    "summary": "Transform Issued Document",
    "effect": "read",
    "scopes": [
      "issued_documents.{tipo}:a"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [
      {
        "name": "original_document_id",
        "type": "integer",
        "required": true,
        "description": "Original document id."
      },
      {
        "name": "new_type",
        "type": "string",
        "required": true,
        "description": "New document type."
      },
      {
        "name": "type",
        "type": "string",
        "required": false,
        "description": "Current document type."
      },
      {
        "name": "e_invoice",
        "type": "0|1",
        "required": false,
        "enum": [
          0,
          1
        ],
        "description": "New document e_invoice."
      },
      {
        "name": "transform_keep_copy",
        "type": "0|1",
        "required": false,
        "enum": [
          0,
          1
        ],
        "description": "Keep the old document."
      }
    ],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "uploadArchiveDocumentAttachment",
    "method": "POST",
    "path": "/c/{company_id}/archive/attachment",
    "tag": "Archive",
    "summary": "Upload Archive Document Attachment",
    "effect": "write",
    "scopes": [
      "archive:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "multipart/form-data",
      "required": false,
      "fields": {
        "data": {},
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "uploadF24Attachment",
    "method": "POST",
    "path": "/c/{company_id}/taxes/attachment",
    "tag": "Taxes",
    "summary": "Upload F24 Attachment",
    "effect": "write",
    "scopes": [
      "taxes:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "multipart/form-data",
      "required": false,
      "fields": {
        "data": {},
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "uploadIssuedDocumentAttachment",
    "method": "POST",
    "path": "/c/{company_id}/issued_documents/attachment",
    "tag": "Issued Documents",
    "summary": "Upload Issued Document Attachment",
    "effect": "write",
    "scopes": [
      "issued_documents.{tipo}:a"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "multipart/form-data",
      "required": false,
      "fields": {
        "data": {},
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "uploadReceivedDocumentAttachment",
    "method": "POST",
    "path": "/c/{company_id}/received_documents/attachment",
    "tag": "Received Documents",
    "summary": "Upload Received Document Attachment",
    "effect": "write",
    "scopes": [
      "received_documents:a",
      "stock:a"
    ],
    "scopesDeclared": true,
    "companyScoped": true,
    "pathParams": [],
    "query": [],
    "body": {
      "contentType": "multipart/form-data",
      "required": false,
      "fields": {
        "data": {},
        "options": []
      }
    },
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "verifyEInvoiceXml",
    "method": "GET",
    "path": "/c/{company_id}/issued_documents/{document_id}/e_invoice/xml_verify",
    "tag": "Issued e-invoices",
    "summary": "Verify E-Invoice XML",
    "effect": "read",
    "scopes": [
      "issued_documents.{tipo}:r"
    ],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "document_id"
    ],
    "query": [],
    "paginated": false,
    "responseType": "application/json"
  },
  {
    "id": "verifyWebhooksSubscription",
    "method": "POST",
    "path": "/c/{company_id}/subscriptions/{subscription_id}/verify",
    "tag": "Webhooks",
    "summary": "Verify Webhooks Subscription",
    "effect": "external",
    "scopes": [],
    "scopesDeclared": false,
    "companyScoped": true,
    "pathParams": [
      "subscription_id"
    ],
    "query": [],
    "body": {
      "contentType": "application/json",
      "required": false,
      "fields": {
        "data": {
          "id": "string",
          "verification_method": "\"header\"|\"query\""
        },
        "options": []
      }
    },
    "paginated": false,
    "responseType": null
  }
];
