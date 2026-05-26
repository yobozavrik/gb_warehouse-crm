// ============================================================================
// TypeScript типи для warehouse-crm
// ============================================================================

export interface ProductCategory {
  id: number
  name: string
  parent_id: number | null
  description: string | null
  sort_order: number
  is_active: boolean
}

export interface CategoryGroup {
  id: number
  name: string
  description: string | null
  product_count: number
  products: ProductCard[]
}

export interface ProductCard {
  id: number
  name: string
  sku: string | null
  unit: string
  purchase_price: number | null
  description: string | null
  total_stock: number
  min_stock: number | null
  supplier: { id: number; name: string } | null
}

export interface ProductDetail {
  product: Product
  stock: StockPerWarehouse[]
  receipts: RecentReceiptItem[]
  price_history: PricePoint[]
  supplier: SupplierBrief | null
}

export interface StockPerWarehouse {
  warehouse_id: number
  warehouse_name: string
  quantity: number
}

export interface RecentReceiptItem {
  receipt_id: string
  receipt_number: string
  receipt_date: string
  supplier_id: number | null
  supplier_name: string | null
  warehouse_id: number
  warehouse_name: string
  quantity: number
  price: number | null
  total: number | null
}

export interface PricePoint {
  date: string
  price: number
  receipt_number: string
  supplier_name: string | null
}

export interface SupplierBrief {
  id: number
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  edrpou: string | null
  category: string | null
}

export interface Product {
  id: number
  name: string
  sku: string | null
  barcode: string | null
  category_id: number | null
  category_name?: string | null
  unit: string
  purchase_price: number | null
  min_stock: number | null
  max_stock: number | null
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Warehouse {
  id: number
  name: string
  warehouse_type: 'shop' | 'workshop' | 'storage' | 'other' | null
  parent_shop_id: number | null
  poster_storage_id: number | null
  address: string | null
  is_active: boolean
}

export interface Shop {
  id: number
  name: string
  code: string | null
  warehouse_id: number | null
  poster_spot_id: number | null
  address: string | null
  is_active: boolean
}

export interface Supplier {
  id: number
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  edrpou: string | null
  payment_days: number | null
  category: string | null
  website: string | null
  notes: string | null
  is_active: boolean
}

export interface SupplierPayment {
  id: string
  supplier_id: number
  amount: number
  payment_date: string
  payment_method: string | null
  reference_number: string | null
  notes: string | null
  created_at: string
}

export interface SupplierWithStats extends Supplier {
  total_receipts: number
  total_products_supplied: number
  total_amount: number
  receipts_30d: number
  last_receipt_date: string | null
  first_receipt_date: string | null
  total_paid: number
  total_debt: number
  payment_count: number
  last_payment_date: string | null
  payment_percent: number
}



export interface User {
  id: string
  auth_user_id: string | null
  full_name: string
  role: 'admin' | 'warehouse_operator' | 'shop_manager' | 'viewer'
  warehouse_id: number | null
  phone: string | null
  telegram_chat_id: string | null
  is_active: boolean
}

export interface StockBalance {
  product_id: number
  warehouse_id: number
  quantity: number
  updated_at: string
}

export interface StockMovement {
  id: string
  product_id: number
  warehouse_id: number
  quantity_change: number
  quantity_before: number | null
  quantity_after: number | null
  movement_type: string
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  created_at: string
}

export interface Receipt {
  id: string
  receipt_number: string
  supplier_id: number | null
  warehouse_id: number
  notes: string | null
  status: 'draft' | 'confirmed' | 'cancelled'
  created_by: string | null
  confirmed_at: string | null
  created_at: string
}

export interface ReceiptItem {
  id: string
  receipt_id: string
  product_id: number
  quantity: number
  price: number | null
  total: number | null
}

export interface Order {
  id: string
  order_number: string
  shop_id: number
  warehouse_id: number
  status: 'draft' | 'submitted' | 'confirmed' | 'partially_shipped' | 'shipped' | 'cancelled'
  source: 'telegram' | 'manual' | 'api'
  telegram_message_id: string | null
  notes: string | null
  created_by: string | null
  submitted_at: string | null
  shipped_at: string | null
  created_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: number
  quantity_requested: number
  quantity_shipped: number
  notes: string | null
}

export interface DashboardSummary {
  stats: {
    products_in_stock: number
    products_out_of_stock: number
    critical_items: number
    stock_value: number
    pending_orders: number
    shipments_today: number
    draft_receipts: number
    active_warehouses: number
  }
  critical_items: Array<{
    product_id: number
    product_name: string
    warehouse_id: number
    warehouse_name: string
    quantity: number
    min_stock: number
    deficit: number
  }>

  recent_movements: Array<{
    id: string
    product_name: string
    warehouse_name: string
    quantity_change: number
    movement_type: string
    created_at: string
  }>
  pending_orders: Array<{
    id: string
    order_number: string
    shop_name: string
    status: string
    items_count: number
    total_requested: number
    created_at: string
  }>
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}



export interface CategoryWithSuppliers {
  category_id: number
  category_name: string
  supplier_count: number
  suppliers: Array<{
    id: number
    name: string
    total_receipts: number
    total_amount: number
    total_products: number
  }>
}

export interface SupplierReceiptItem {
  product_id: number
  product_name: string
  sku: string | null
  quantity: number
  price: number | null
  total: number | null
}

export interface SupplierReceipt {
  id: string
  receipt_number: string
  confirmed_at: string
  warehouse_name: string
  items_count: number
  total_amount: number
  items: SupplierReceiptItem[]
}

export interface SupplierDetail {
  supplier: {
    id: number
    name: string
    contact_person: string | null
    phone: string | null
    email: string | null
    edrpou: string | null
    category: string | null
    website: string | null
    payment_days: number | null
    notes: string | null
    created_at: string
  }
  receipts: SupplierReceipt[]
  payments: Array<{
    id: string
    amount: number
    payment_date: string
    payment_method: string | null
    reference_number: string | null
    notes: string | null
  }>
  stats: {
    total_receipts: number
    total_items: number
    total_amount: number
    total_paid: number
    total_debt: number
    first_receipt_date: string | null
    last_receipt_date: string | null
    payment_count: number
    last_payment_date: string | null
  }
}

// ============================================================================
// M9 — typed RPC returns
// ============================================================================
export interface StockSummaryItem {
  warehouse_id: number
  warehouse_name: string
  product_id: number
  product_name: string
  sku: string | null
  unit: string
  category_id: number | null
  category_name: string | null
  quantity: number
  min_stock: number | null
  max_stock: number | null
  stock_status: 'critical' | 'overstock' | 'normal'
  updated_at: string
}

export type CriticalStockItem = StockSummaryItem

export interface StockMovementItem {
  id: string
  product_name: string
  warehouse_name: string
  movement_type: string
  quantity_change: number
  created_at: string
}

export interface OrderListItem {
  id: string
  order_number: string
  shop_id: number
  shop_name: string
  warehouse_id: number
  warehouse_name: string
  status: string
  source: string
  notes: string | null
  created_by_name: string
  items_count: number
  total_requested: number
  total_shipped: number
  submitted_at: string | null
  confirmed_at: string | null
  shipped_at: string | null
  created_at: string
}

export interface OrderDetailResponse {
  order: {
    id: string
    order_number: string
    shop_id: number
    shop_name: string
    warehouse_id: number
    warehouse_name: string
    status: string
    source: string
    telegram_message_id: string | null
    notes: string | null
    created_by_name: string
    submitted_at: string | null
    confirmed_at: string | null
    shipped_at: string | null
    created_at: string
  }
  items: Array<{
    id: string
    product_id: number
    product_name: string
    sku: string | null
    unit: string
    quantity_requested: number
    quantity_shipped: number
    notes: string | null
  }>
  shipments: Array<{
    id: string
    shipment_number: string
    status: string
    shipped_at: string | null
    created_at: string
  }>
}

export interface RpcResult {
  success: boolean
  error?: string
  order_number?: string
  id?: string
}

export interface ReceiptListItem extends Receipt {
  supplier: { id: number; name: string } | null
  warehouse: { id: number; name: string } | null
  receipt_items: Array<{ count: number }>
}

export interface ReceiptWithRefs extends Receipt {
  supplier: Supplier | null
  warehouse: Warehouse | null
}

export interface ReceiptItemWithProduct extends ReceiptItem {
  product: Pick<Product, 'id' | 'name' | 'sku' | 'unit'>
  created_at?: string
}

export interface ReceiptDetailResponse {
  receipt: ReceiptWithRefs
  items: ReceiptItemWithProduct[]
  total: number
}
