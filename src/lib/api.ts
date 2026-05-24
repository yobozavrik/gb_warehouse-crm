import { supabase } from './supabase'
import type { DashboardSummary, PaginatedResponse, Product, ProductCategory, Warehouse, Shop, Supplier, SupplierPayment, SupplierWithStats, Receipt, Order, StockMovement, StockBalance, ProductDetail, CategoryGroup, CategoryWithSuppliers } from './types'

// ============================================================================
// DASHBOARD
// ============================================================================
export async function fetchDashboardSummary(warehouseId?: number): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc('rpc_dashboard_summary', {
    p_warehouse_id: warehouseId ?? null,
  })
  if (error) throw error
  return data
}

// ============================================================================
// PRODUCTS
// ============================================================================
export async function fetchProducts(options?: {
  categoryId?: number
  search?: string
  page?: number
  pageSize?: number
}): Promise<PaginatedResponse<Product & { total_stock: number; stock: any }>> {
  const { data, error } = await supabase.rpc('rpc_product_catalog', {
    p_category_id: options?.categoryId ?? null,
    p_search: options?.search ?? null,
    p_warehouse_id: null,
    p_page: options?.page ?? 1,
    p_page_size: options?.pageSize ?? 100,
  })
  if (error) throw error
  return data
}

export async function createProduct(product: {
  name: string; sku?: string; barcode?: string
  category_id?: number; unit?: string; purchase_price?: number
  min_stock?: number; max_stock?: number; description?: string
}): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert([{ ...product, unit: product.unit ?? 'С€С‚' }])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProduct(id: number, product: Partial<Product>): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update(product)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================================
// CATEGORIES
// ============================================================================
export async function fetchCategoriesTree(): Promise<ProductCategory[]> {
  const { data, error } = await supabase.rpc('rpc_categories_tree')
  if (error) throw error
  return data
}

export async function fetchCategoriesWithProducts(options?: {
  search?: string
  categoryId?: number
}): Promise<{ categories: CategoryGroup[] }> {
  const { data, error } = await supabase.rpc('rpc_categories_with_products', {
    p_search: options?.search ?? null,
    p_category_id: options?.categoryId ?? null,
  })
  if (error) throw error
  return data
}

// ============================================================================
// PRODUCT DETAIL
// ============================================================================
export async function fetchProductDetail(productId: number): Promise<ProductDetail> {
  const { data, error } = await supabase.rpc('rpc_product_detail', {
    p_product_id: productId,
  })
  if (error) throw error
  return data
}

// ============================================================================
// WAREHOUSES
// ============================================================================
export async function fetchWarehouses(): Promise<Warehouse[]> {
  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

// ============================================================================
// SHOPS
// ============================================================================
export async function fetchShops(): Promise<Shop[]> {
  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

// ============================================================================
// SUPPLIERS
// ============================================================================
export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function fetchSuppliersWithStats(): Promise<SupplierWithStats[]> {
  const { data, error } = await supabase.rpc('rpc_suppliers_with_stats')
  if (error) throw error
  return data
}

export async function fetchSupplierPayments(supplierId: number): Promise<SupplierPayment[]> {
  const { data, error } = await supabase
    .from('supplier_payments')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('payment_date', { ascending: false })
  if (error) throw error
  return data
}

export async function createSupplierPayment(payment: {
  supplier_id: number
  amount: number
  payment_date?: string
  payment_method?: string
  reference_number?: string
  notes?: string
}): Promise<SupplierPayment> {
  const { data, error } = await supabase
    .from('supplier_payments')
    .insert([payment])
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================================
// STOCK BALANCES
// ============================================================================// ============================================================================
// CATEGORIES WITH SUPPLIERS
// ============================================================================
export async function fetchCategoriesWithSuppliers(): Promise<CategoryWithSuppliers[]> {
  const { data, error } = await supabase.rpc('rpc_categories_with_suppliers')
  if (error) throw error
  return data
}


export async function fetchStockBalances(warehouseId?: number): Promise<StockBalance[]> {
  let query = supabase.from('stock_balances').select('*')
  if (warehouseId) query = query.eq('warehouse_id', warehouseId)
  const { data, error } = await query.order('product_id')
  if (error) throw error
  return data
}

export async function fetchStockSummary(warehouseId?: number): Promise<any[]> {
  let query = supabase.from('v_stock_summary').select('*')
  if (warehouseId) query = query.eq('warehouse_id', warehouseId)
  const { data, error } = await query.order('warehouse_name').order('category_name').order('product_name')
  if (error) throw error
  return data
}

export async function fetchCriticalStock(warehouseId?: number): Promise<any[]> {
  let query = supabase.from('v_critical_stock').select('*')
  if (warehouseId) query = query.eq('warehouse_id', warehouseId)
  const { data, error } = await query
  if (error) throw error
  return data
}

// ============================================================================
// STOCK MOVEMENTS
// ============================================================================
export async function fetchStockMovements(options?: {
  productId?: number; warehouseId?: number; movementType?: string
  dateFrom?: string; dateTo?: string; page?: number; pageSize?: number
}): Promise<PaginatedResponse<any>> {
  const { data, error } = await supabase.rpc('rpc_stock_movements_list', {
    p_product_id: options?.productId ?? null,
    p_warehouse_id: options?.warehouseId ?? null,
    p_movement_type: options?.movementType ?? null,
    p_date_from: options?.dateFrom ?? null,
    p_date_to: options?.dateTo ?? null,
    p_page: options?.page ?? 1,
    p_page_size: options?.pageSize ?? 50,
  })
  if (error) throw error
  return data
}

// ============================================================================
// RECEIPTS
// ============================================================================
export async function fetchReceipts(): Promise<any[]> {
  const { data, error } = await supabase
    .from('receipts')
    .select('*, supplier:supplier_id(id, name), warehouse:warehouse_id(id, name), receipt_items:receipt_items(count)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchReceiptDetail(receiptId: string): Promise<{
  receipt: any
  items: any[]
  total: number
}> {
  const { data: receipt, error: e1 } = await supabase
    .from('receipts')
    .select('*, supplier:supplier_id(*), warehouse:warehouse_id(*)')
    .eq('id', receiptId)
    .single()
  if (e1) throw e1

  const { data: items, error: e2 } = await supabase
    .from('receipt_items')
    .select('*, product:product_id(id, name, sku, unit)')
    .eq('receipt_id', receiptId)
    .order('created_at', { ascending: true })
  if (e2) throw e2

  const total = items.reduce((acc, i) => acc + (i.total || 0), 0)
  return { receipt, items, total }
}

export async function createReceipt(receipt: {
  receipt_number: string; supplier_id?: number; warehouse_id: number; notes?: string
}): Promise<Receipt> {
  const { data, error } = await supabase
    .from('receipts')
    .insert([receipt])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function confirmReceipt(receiptId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_receipt', {
    p_receipt_id: receiptId,
    p_user_id: null,
  })
  if (error) throw error
}

// ============================================================================
// ORDERS
// ============================================================================
export async function fetchOrders(options?: {
  status?: string; warehouseId?: number; shopId?: number
  source?: string; page?: number; pageSize?: number
}): Promise<PaginatedResponse<any>> {
  const { data, error } = await supabase.rpc('rpc_orders_list', {
    p_status: options?.status ?? null,
    p_warehouse_id: options?.warehouseId ?? null,
    p_shop_id: options?.shopId ?? null,
    p_source: options?.source ?? null,
    p_date_from: null,
    p_date_to: null,
    p_page: options?.page ?? 1,
    p_page_size: options?.pageSize ?? 50,
  })
  if (error) throw error
  return data
}

export async function fetchOrderDetail(orderId: string): Promise<any> {
  const { data, error } = await supabase.rpc('rpc_order_detail', {
    p_order_id: orderId,
  })
  if (error) throw error
  return data
}

export async function shipOrder(orderId: string): Promise<any> {
  const { data, error } = await supabase.rpc('ship_order', {
    p_order_id: orderId,
    p_user_id: null,
  })
  if (error) throw error
  return data
}

// ============================================================================
// TRANSFERS / WRITE-OFFS / INVENTORY
// ============================================================================
export async function confirmTransfer(transferId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_transfer', {
    p_transfer_id: transferId,
    p_user_id: null,
  })
  if (error) throw error
}

export async function confirmWriteOff(writeOffId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_write_off', {
    p_write_off_id: writeOffId,
    p_user_id: null,
  })
  if (error) throw error
}

export async function completeInventory(inventoryId: string): Promise<void> {
  const { error } = await supabase.rpc('complete_inventory', {
    p_inventory_id: inventoryId,
    p_user_id: null,
  })
  if (error) throw error
}

// ============================================================================
// GENERIC TABLE ACCESS (РґР»СЏ Р°СѓРґРёС‚Р° Рё РїСЂРѕСЃС‚С‹С… СЃРїСЂР°РІРѕС‡РЅРёРєРѕРІ)
// ============================================================================
export async function fetchFromTable<T>(table: string, options?: {
  orderBy?: string; orderAsc?: boolean; limit?: number
}): Promise<T[]> {
  let query = supabase.from(table as any).select('*')
  if (options?.orderBy) {
    query = query.order(options.orderBy, { ascending: options.orderAsc ?? false })
  }
  if (options?.limit) query = query.limit(options.limit)
  const { data, error } = await query
  if (error) throw error
  return data as T[]
}

// ============================================================================
// EXPORT (CSV)
// ============================================================================
export async function exportStockSummary(warehouseId?: number): Promise<any[]> {
  return fetchStockSummary(warehouseId)
}

