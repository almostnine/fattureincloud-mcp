# Copertura dell'API

File generato da `scripts/gen-coverage.ts`: non modificare a mano.

- Specifica: OpenAPI Fatture in Cloud 2.1.8, 123 operazioni.
- Raggiungibili da almeno un tool: 123 su 123 (verificato anche da un test).
- Con un tool dedicato: 79; le altre passano dai tool generici `fic_api_read` e `fic_api_write`, guidati dal catalogo. Tutte le cancellazioni passano da `fic_delete`.
- Esercitate dai test automatici (risposte simulate): 123 su 123.
- I percorsi sono relativi a `/c/{company_id}` salvo quelli sotto `/user` e `/info`.

### Archive

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `listArchiveDocuments` | GET `/archive` | lettura | readonly | `fic_api_read` | sì |
| `createArchiveDocument` | POST `/archive` | scrittura | write | `fic_api_write` | sì |
| `deleteArchiveDocument` | DELETE `/archive/{document_id}` | cancellazione | write | `fic_delete` | sì |
| `getArchiveDocument` | GET `/archive/{document_id}` | lettura | readonly | `fic_delete`, `fic_api_read` | sì |
| `modifyArchiveDocument` | PUT `/archive/{document_id}` | scrittura | write | `fic_api_write` | sì |
| `uploadArchiveDocumentAttachment` | POST `/archive/attachment` | scrittura | write | `fic_api_write` | sì |

### Cashbook

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `listCashbookEntries` | GET `/cashbook` | lettura | readonly | `fic_list_cashbook`, `fic_api_read` | sì |
| `createCashbookEntry` | POST `/cashbook` | scrittura | write | `fic_api_write` | sì |
| `deleteCashbookEntry` | DELETE `/cashbook/{document_id}` | cancellazione | write | `fic_delete` | sì |
| `getCashbookEntry` | GET `/cashbook/{document_id}` | lettura | readonly | `fic_list_cashbook`, `fic_delete`, `fic_api_read` | sì |
| `modifyCashbookEntry` | PUT `/cashbook/{document_id}` | scrittura | write | `fic_api_write` | sì |

### Clients

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `listClients` | GET `/entities/clients` | lettura | readonly | `fic_search_entities`, `fic_create_entity`, `fic_api_read` | sì |
| `createClient` | POST `/entities/clients` | scrittura | write | `fic_create_entity`, `fic_api_write` | sì |
| `deleteClient` | DELETE `/entities/clients/{client_id}` | cancellazione | write | `fic_delete` | sì |
| `getClient` | GET `/entities/clients/{client_id}` | lettura | readonly | `fic_get_entity`, `fic_update_entity`, `fic_create_issued_document`, `fic_duplicate_issued_document`, `fic_delete`, `fic_send_email`, `fic_api_read` | sì |
| `modifyClient` | PUT `/entities/clients/{client_id}` | scrittura | write | `fic_update_entity`, `fic_api_write` | sì |
| `getClientInfo` | GET `/entities/clients/info` | lettura | readonly | `fic_api_read` | sì |

### Companies

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `getCompanyInfo` | GET `/company/info` | lettura | readonly | `fic_account_info`, `fic_api_read` | sì |
| `getCompanyPlanUsage` | GET `/company/plan_usage` | lettura | readonly | `fic_account_info`, `fic_api_read` | sì |

### Emails

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `listEmails` | GET `/emails` | lettura | readonly | `fic_api_read` | sì |

### Info

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `listArchiveCategories` | GET `/info/archive_categories` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `listCostCenters` | GET `/info/cost_centers` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `listPaymentAccounts` | GET `/info/payment_accounts` | lettura | readonly | `fic_reference_data`, `fic_set_installment_status`, `fic_api_read` | sì |
| `listPaymentMethods` | GET `/info/payment_methods` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `listProductCategories` | GET `/info/product_categories` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `listReceivedDocumentCategories` | GET `/info/received_document_categories` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `listRevenueCenters` | GET `/info/revenue_centers` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `listVatTypes` | GET `/info/vat_types` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `listCities` | GET `/info/cities` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `listCountries` | GET `/info/countries` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `listCurrencies` | GET `/info/currencies` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `listDetailedCountries` | GET `/info/detailed_countries` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `listDeliveryNotesDefaultCausals` | GET `/info/dn_causals` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `listLanguages` | GET `/info/languages` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `listUnitsOfMeasure` | GET `/info/measures` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `listDefaultTemplates` | GET `/info/templates` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |

### Issued Documents

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `ListBinIssuedDocuments` | GET `/bin/issued_documents` | lettura | readonly | `fic_api_read` | sì |
| `DeleteBinIssuedDocument` | DELETE `/bin/issued_documents/{document_id}` | cancellazione definitiva | write | `fic_delete` | sì |
| `GetBinIssuedDocument` | GET `/bin/issued_documents/{document_id}` | lettura | readonly | `fic_delete`, `fic_api_read` | sì |
| `RecoverBinIssuedDocument` | POST `/bin/issued_documents/{document_id}/recover` | scrittura | write | `fic_api_write` | sì |
| `listIssuedDocuments` | GET `/issued_documents` | lettura | readonly | `fic_list_issued_documents`, `fic_get_issued_document`, `fic_list_installments`, `fic_get_entity`, `fic_situation`, `fic_reconcile`, `fic_api_read` | sì |
| `createIssuedDocument` | POST `/issued_documents` | scrittura | write | `fic_create_issued_document`, `fic_convert_issued_document`, `fic_duplicate_issued_document`, `fic_api_write` | sì |
| `deleteIssuedDocument` | DELETE `/issued_documents/{document_id}` | cancellazione | write | `fic_delete` | sì |
| `getIssuedDocument` | GET `/issued_documents/{document_id}` | lettura | readonly | `fic_get_issued_document`, `fic_get_einvoice`, `fic_download_file`, `fic_set_installment_status`, `fic_update_issued_document`, `fic_convert_issued_document`, `fic_duplicate_issued_document`, `fic_delete`, `fic_send_einvoice`, `fic_send_email`, `fic_api_read` | sì |
| `modifyIssuedDocument` | PUT `/issued_documents/{document_id}` | scrittura | write | `fic_set_installment_status`, `fic_update_issued_document`, `fic_api_write` | sì |
| `deleteIssuedDocumentAttachment` | DELETE `/issued_documents/{document_id}/attachment` | cancellazione | write | `fic_delete` | sì |
| `getEmailData` | GET `/issued_documents/{document_id}/email` | lettura | readonly | `fic_send_email`, `fic_api_read` | sì |
| `scheduleEmail` | POST `/issued_documents/{document_id}/email` | invio | full | `fic_send_email` | sì |
| `getExistingIssuedDocumentTotals` | POST `/issued_documents/{document_id}/totals` | lettura | readonly | `fic_update_issued_document`, `fic_api_read` | sì |
| `uploadIssuedDocumentAttachment` | POST `/issued_documents/attachment` | scrittura | write | `fic_api_write` | sì |
| `getIssuedDocumentPreCreateInfo` | GET `/issued_documents/info` | lettura | readonly | `fic_create_issued_document`, `fic_api_read` | sì |
| `joinIssuedDocuments` | GET `/issued_documents/join` | lettura | readonly | `fic_api_read` | sì |
| `getNewIssuedDocumentTotals` | POST `/issued_documents/totals` | lettura | readonly | `fic_create_issued_document`, `fic_duplicate_issued_document`, `fic_api_read` | sì |
| `transformIssuedDocument` | GET `/issued_documents/transform` | lettura | readonly | `fic_convert_issued_document`, `fic_api_read` | sì |

### Issued e-invoices

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `getEInvoiceRejectionReason` | GET `/issued_documents/{document_id}/e_invoice/error_reason` | lettura | readonly | `fic_get_einvoice`, `fic_api_read` | sì |
| `sendEInvoice` | POST `/issued_documents/{document_id}/e_invoice/send` | invio | full | `fic_send_einvoice` | sì |
| `getEInvoiceXml` | GET `/issued_documents/{document_id}/e_invoice/xml` | lettura | readonly | `fic_download_file`, `fic_api_read` | sì |
| `verifyEInvoiceXml` | GET `/issued_documents/{document_id}/e_invoice/xml_verify` | lettura | readonly | `fic_get_einvoice`, `fic_send_einvoice`, `fic_api_read` | sì |

### PriceLists

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `getPriceLists` | GET `/price_lists` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `getPriceListItems` | GET `/price_lists/{price_list_id}/items` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |

### Products

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `listProducts` | GET `/products` | lettura | readonly | `fic_api_read` | sì |
| `createProduct` | POST `/products` | scrittura | write | `fic_api_write` | sì |
| `deleteProduct` | DELETE `/products/{product_id}` | cancellazione | write | `fic_delete` | sì |
| `getProduct` | GET `/products/{product_id}` | lettura | readonly | `fic_delete`, `fic_api_read` | sì |
| `modifyProduct` | PUT `/products/{product_id}` | scrittura | write | `fic_api_write` | sì |

### Receipts

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `listReceipts` | GET `/receipts` | lettura | readonly | `fic_api_read` | sì |
| `createReceipt` | POST `/receipts` | scrittura | write | `fic_api_write` | sì |
| `deleteReceipt` | DELETE `/receipts/{document_id}` | cancellazione | write | `fic_delete` | sì |
| `getReceipt` | GET `/receipts/{document_id}` | lettura | readonly | `fic_delete`, `fic_api_read` | sì |
| `modifyReceipt` | PUT `/receipts/{document_id}` | scrittura | write | `fic_api_write` | sì |
| `getReceiptPreCreateInfo` | GET `/receipts/info` | lettura | readonly | `fic_api_read` | sì |
| `getReceiptsMonthlyTotals` | GET `/receipts/monthly_totals` | lettura | readonly | `fic_api_read` | sì |

### Received Documents

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `ListBinReceivedDocuments` | GET `/bin/received_documents` | lettura | readonly | `fic_api_read` | sì |
| `DeleteBinReceivedDocument` | DELETE `/bin/received_documents/{document_id}` | cancellazione definitiva | write | `fic_delete` | sì |
| `GetBinReceivedDocument` | GET `/bin/received_documents/{document_id}` | lettura | readonly | `fic_delete`, `fic_api_read` | sì |
| `RecoverBinReceivedDocument` | POST `/bin/received_documents/{document_id}/recover` | scrittura | write | `fic_api_write` | sì |
| `listReceivedDocuments` | GET `/received_documents` | lettura | readonly | `fic_situation`, `fic_list_received_documents`, `fic_api_read` | sì |
| `createReceivedDocument` | POST `/received_documents` | scrittura | write | `fic_api_write` | sì |
| `deleteReceivedDocument` | DELETE `/received_documents/{document_id}` | cancellazione | write | `fic_delete` | sì |
| `getReceivedDocument` | GET `/received_documents/{document_id}` | lettura | readonly | `fic_get_received_document`, `fic_delete`, `fic_api_read` | sì |
| `modifyReceivedDocument` | PUT `/received_documents/{document_id}` | scrittura | write | `fic_api_write` | sì |
| `deleteReceivedDocumentAttachment` | DELETE `/received_documents/{document_id}/attachment` | cancellazione | write | `fic_delete` | sì |
| `getExistingReceivedDocumentTotals` | POST `/received_documents/{document_id}/totals` | lettura | readonly | `fic_api_read` | sì |
| `uploadReceivedDocumentAttachment` | POST `/received_documents/attachment` | scrittura | write | `fic_api_write` | sì |
| `getReceivedDocumentPreCreateInfo` | GET `/received_documents/info` | lettura | readonly | `fic_api_read` | sì |
| `listPendingReceivedDocuments` | GET `/received_documents/pending` | lettura | readonly | `fic_list_received_documents`, `fic_api_read` | sì |
| `getPendingReceivedDocument` | GET `/received_documents/pending/{document_id}` | lettura | readonly | `fic_get_received_document`, `fic_api_read` | sì |
| `getNewReceivedDocumentTotals` | POST `/received_documents/totals` | lettura | readonly | `fic_api_read` | sì |

### Settings

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `createPaymentAccount` | POST `/settings/payment_accounts` | scrittura | write | `fic_api_write` | sì |
| `deletePaymentAccount` | DELETE `/settings/payment_accounts/{payment_account_id}` | cancellazione | write | `fic_delete` | sì |
| `getPaymentAccount` | GET `/settings/payment_accounts/{payment_account_id}` | lettura | readonly | `fic_delete`, `fic_api_read` | sì |
| `modifyPaymentAccount` | PUT `/settings/payment_accounts/{payment_account_id}` | scrittura | write | `fic_api_write` | sì |
| `createPaymentMethod` | POST `/settings/payment_methods` | scrittura | write | `fic_api_write` | sì |
| `deletePaymentMethod` | DELETE `/settings/payment_methods/{payment_method_id}` | cancellazione | write | `fic_delete` | sì |
| `getPaymentMethod` | GET `/settings/payment_methods/{payment_method_id}` | lettura | readonly | `fic_delete`, `fic_api_read` | sì |
| `modifyPaymentMethod` | PUT `/settings/payment_methods/{payment_method_id}` | scrittura | write | `fic_api_write` | sì |
| `getTaxProfile` | GET `/settings/tax_profile` | lettura | readonly | `fic_api_read` | sì |
| `listTemplates` | GET `/settings/templates` | lettura | readonly | `fic_reference_data`, `fic_api_read` | sì |
| `getTemplate` | GET `/settings/templates/{template_id}` | lettura | readonly | `fic_api_read` | sì |
| `createVatType` | POST `/settings/vat_types` | scrittura | write | `fic_api_write` | sì |
| `deleteVatType` | DELETE `/settings/vat_types/{vat_type_id}` | cancellazione | write | `fic_delete` | sì |
| `getVatType` | GET `/settings/vat_types/{vat_type_id}` | lettura | readonly | `fic_delete`, `fic_api_read` | sì |
| `modifyVatType` | PUT `/settings/vat_types/{vat_type_id}` | scrittura | write | `fic_api_write` | sì |

### Suppliers

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `listSuppliers` | GET `/entities/suppliers` | lettura | readonly | `fic_search_entities`, `fic_create_entity`, `fic_api_read` | sì |
| `createSupplier` | POST `/entities/suppliers` | scrittura | write | `fic_create_entity`, `fic_api_write` | sì |
| `deleteSupplier` | DELETE `/entities/suppliers/{supplier_id}` | cancellazione | write | `fic_delete` | sì |
| `getSupplier` | GET `/entities/suppliers/{supplier_id}` | lettura | readonly | `fic_get_entity`, `fic_update_entity`, `fic_delete`, `fic_api_read` | sì |
| `modifySupplier` | PUT `/entities/suppliers/{supplier_id}` | scrittura | write | `fic_update_entity`, `fic_api_write` | sì |

### Taxes

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `listF24` | GET `/taxes` | lettura | readonly | `fic_api_read` | sì |
| `createF24` | POST `/taxes` | scrittura | write | `fic_api_write` | sì |
| `deleteF24` | DELETE `/taxes/{document_id}` | cancellazione | write | `fic_delete` | sì |
| `getF24` | GET `/taxes/{document_id}` | lettura | readonly | `fic_delete`, `fic_api_read` | sì |
| `modifyF24` | PUT `/taxes/{document_id}` | scrittura | write | `fic_api_write` | sì |
| `deleteF24Attachment` | DELETE `/taxes/{document_id}/attachment` | cancellazione | write | `fic_delete` | sì |
| `uploadF24Attachment` | POST `/taxes/attachment` | scrittura | write | `fic_api_write` | sì |

### User

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `listUserCompanies` | GET `/user/companies` | lettura | readonly | `fic_account_info`, `fic_api_read` | sì |
| `getUserInfo` | GET `/user/info` | lettura | readonly | `fic_account_info`, `fic_api_read` | sì |

### Webhooks

| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |
|---|---|---|---|---|---|
| `listWebhooksSubscriptions` | GET `/subscriptions` | lettura | readonly | `fic_api_read` | sì |
| `CreateWebhooksSubscription` | POST `/subscriptions` | scrittura verso terzi | full | `fic_api_write` | sì |
| `deleteWebhooksSubscription` | DELETE `/subscriptions/{subscription_id}` | cancellazione | write | `fic_delete` | sì |
| `getWebhooksSubscription` | GET `/subscriptions/{subscription_id}` | lettura | readonly | `fic_delete`, `fic_api_read` | sì |
| `modifyWebhooksSubscription` | PUT `/subscriptions/{subscription_id}` | scrittura verso terzi | full | `fic_api_write` | sì |
| `verifyWebhooksSubscription` | POST `/subscriptions/{subscription_id}/verify` | scrittura verso terzi | full | `fic_api_write` | sì |
