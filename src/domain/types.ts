/**
 * Tipi del sottoinsieme dell'API usato dai tool. Scritti a mano sugli schemi dell'OpenAPI 2.1.8;
 * le fixture dei test sono validate contro gli schemi originali (tests/contract).
 */

export const ISSUED_TYPES = [
  'invoice',
  'credit_note',
  'proforma',
  'quote',
  'order',
  'delivery_note',
  'receipt',
  'work_report',
  'supplier_order',
  'self_own_invoice',
  'self_supplier_invoice',
] as const;
export type IssuedType = (typeof ISSUED_TYPES)[number];

export const RECEIVED_TYPES = [
  'expense',
  'passive_credit_note',
  'passive_delivery_note',
  'self_invoice',
] as const;
export type ReceivedType = (typeof RECEIVED_TYPES)[number];

export type PaymentStatus = 'not_paid' | 'paid' | 'reversed';

export interface PaymentAccount {
  id?: number | null;
  name?: string | null;
  type?: string | null;
  iban?: string | null;
  sia?: string | null;
  cuc?: string | null;
  virtual?: boolean | null;
}

export interface PaymentItem {
  id?: number | null;
  due_date?: string | null;
  amount?: number | null;
  status?: PaymentStatus | null;
  payment_account?: PaymentAccount | null;
  paid_date?: string | null;
  ei_raw?: unknown;
  payment_terms?: { days?: number | null; type?: string | null } | null;
}

export interface VatRef {
  id?: number | null;
  value?: number | null;
  description?: string | null;
  ei_type?: string | null;
}

export interface Item {
  id?: number | null;
  product_id?: number | null;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  qty?: number | null;
  measure?: string | null;
  net_price?: number | null;
  gross_price?: number | null;
  vat?: VatRef | null;
  discount?: number | null;
  discount_highlight?: boolean | null;
  not_taxable?: boolean | null;
  apply_withholding_taxes?: boolean | null;
  in_dn?: boolean | null;
  stock?: number | null;
  ei_raw?: unknown;
}

export interface Entity {
  id?: number | null;
  code?: string | null;
  name?: string | null;
  type?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  contact_person?: string | null;
  vat_number?: string | null;
  tax_code?: string | null;
  address_street?: string | null;
  address_postal_code?: string | null;
  address_city?: string | null;
  address_province?: string | null;
  address_extra?: string | null;
  country?: string | null;
  country_iso?: string | null;
  email?: string | null;
  certified_email?: string | null;
  phone?: string | null;
  fax?: string | null;
  notes?: string | null;
  ei_code?: string | null;
  e_invoice?: boolean | null;
  default_payment_terms?: number | null;
  default_payment_terms_type?: string | null;
  default_vat?: VatRef | null;
  default_payment_method?: { id?: number | null; name?: string | null } | null;
  bank_iban?: string | null;
  bank_name?: string | null;
  has_intent_declaration?: boolean | null;
  intent_declaration_protocol_number?: string | null;
  intent_declaration_protocol_date?: string | null;
  shipping_address?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface IssuedDocument {
  id?: number | null;
  type?: IssuedType | null;
  entity?: Entity | null;
  number?: number | null;
  numeration?: string | null;
  date?: string | null;
  year?: number | null;
  currency?: { id?: string | null; symbol?: string | null; exchange_rate?: string | null } | null;
  language?: { code?: string | null; name?: string | null } | null;
  subject?: string | null;
  visible_subject?: string | null;
  rc_center?: string | null;
  notes?: string | null;
  rivalsa?: number | null;
  cassa?: number | null;
  cassa_taxable?: number | null;
  amount_cassa_taxable?: number | null;
  cassa2?: number | null;
  cassa2_taxable?: number | null;
  amount_cassa2_taxable?: number | null;
  global_cassa_taxable?: number | null;
  amount_global_cassa_taxable?: number | null;
  withholding_tax?: number | null;
  withholding_tax_taxable?: number | null;
  other_withholding_tax?: number | null;
  stamp_duty?: number | null;
  payment_method?: {
    id?: number | null;
    name?: string | null;
    default_payment_account?: PaymentAccount | null;
  } | null;
  use_split_payment?: boolean | null;
  use_gross_prices?: boolean | null;
  e_invoice?: boolean | null;
  ei_data?: Record<string, unknown> | null;
  ei_cassa_type?: string | null;
  ei_cassa2_type?: string | null;
  ei_withholding_tax_causal?: string | null;
  ei_other_withholding_tax_type?: string | null;
  ei_other_withholding_tax_causal?: string | null;
  items_list?: Item[] | null;
  payments_list?: PaymentItem[] | null;
  template?: { id?: number | null } | null;
  delivery_note_template?: unknown;
  acc_inv_template?: unknown;
  h_margins?: number | null;
  v_margins?: number | null;
  show_payments?: boolean | null;
  show_payment_method?: boolean | null;
  show_totals?: string | null;
  show_notification_button?: boolean | null;
  show_tspay_button?: boolean | null;
  delivery_note?: boolean | null;
  accompanying_invoice?: boolean | null;
  amount_net?: number | null;
  amount_vat?: number | null;
  amount_gross?: number | null;
  amount_due_discount?: number | null;
  amount_rivalsa?: number | null;
  amount_rivalsa_taxable?: number | null;
  amount_withholding_tax_taxable?: number | null;
  amount_other_withholding_tax_taxable?: number | null;
  amount_enasarco_taxable?: number | null;
  extra_data?: Record<string, unknown> | null;
  dn_ai_packages_number?: number | null;
  dn_ai_weight?: number | null;
  dn_ai_causal?: string | null;
  dn_ai_destination?: string | null;
  dn_ai_transporter?: string | null;
  dn_ai_notes?: string | null;
  amount_withholding_tax?: number | null;
  amount_other_withholding_tax?: number | null;
  ei_raw?: unknown;
  ei_status?: string | null;
  locked?: boolean | null;
  next_due_date?: string | null;
  url?: string | null;
  dn_url?: string | null;
  attachment_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  price_list_id?: string | null;
}

export interface ReceivedDocument {
  id?: number | null;
  type?: ReceivedType | null;
  entity?: Entity | null;
  date?: string | null;
  category?: string | null;
  description?: string | null;
  amount_net?: number | null;
  amount_vat?: number | null;
  amount_gross?: number | null;
  amount_withholding_tax?: number | null;
  amount_other_withholding_tax?: number | null;
  invoice_number?: string | null;
  is_marked?: boolean | null;
  is_detailed?: boolean | null;
  e_invoice?: boolean | null;
  next_due_date?: string | null;
  currency?: { id?: string | null } | null;
  items_list?: Array<Record<string, unknown>> | null;
  payments_list?: PaymentItem[] | null;
  attachment_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ListResponse<T> {
  data?: T[];
}

export interface DataResponse<T> {
  data?: T;
}
