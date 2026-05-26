import { supabase } from './supabase'
import type { DashboardSummary, PaginatedResponse, Product, ProductCategory, Warehouse, Shop, Supplier, SupplierPayment, SupplierWithStats, StockBalance, ProductDetail, CategoryGroup, CategoryWithSuppliers, SupplierDetail, StockSummaryItem, CriticalStockItem, StockMovementItem, OrderListItem, OrderDetailResponse, RpcResult, ReceiptDetailResponse, ReceiptListItem, ConfirmReceiptResult, ConfirmTransferResult, ConfirmWriteOffResult, CompleteInventoryResult, CreateInventoryResult, InventoryDetail, SetActualResult, AddProductResult, ResortResult } from './types'

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
    .insert([{ ...product, unit: product.unit ?? 'шт' }])
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

export async function fetchSupplierDetail(supplierId: number): Promise<SupplierDetail> {
  const { data, error } = await supabase.rpc('rpc_supplier_detail', {
    p_supplier_id: supplierId,
  })
  if (error) throw error
  return data
}

// ============================================================================
// CATEGORIES WITH SUPPLIERS
// ============================================================================
export async function fetchCategoriesWithSuppliers(): Promise<CategoryWithSuppliers[]> {
  const { data, error } = await supabase.rpc('rpc_categories_with_suppliers')
  if (error) throw error
  return data
}

// ============================================================================
// STOCK BALANCES
// ============================================================================
export async function fetchStockBalances(warehouseId?: number): Promise<StockBalance[]> {
  let query = supabase.from('stock_balances').select('*')
  if (warehouseId) query = query.eq('warehouse_id', warehouseId)
  const { data, error } = await query.order('product_id')
  if (error) throw error
  return data
}

export async function fetchStockSummary(warehouseId?: number): Promise<StockSummaryItem[]> {
  let query = supabase.from('v_stock_summary').select('*')
  if (warehouseId) query = query.eq('warehouse_id', warehouseId)
  const { data, error } = await query.order('warehouse_name').order('category_name').order('product_name')
  if (error) throw error
  return data
}

export async function fetchCriticalStock(warehouseId?: number): Promise<CriticalStockItem[]> {
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
}): Promise<PaginatedResponse<StockMovementItem>> {
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
export async function fetchReceipts(): Promise<ReceiptListItem[]> {
  const { data, error } = await supabase
    .from('receipts')
    .select('*, supplier:supplier_id(id, name), warehouse:warehouse_id(id, name), receipt_items:receipt_items(count)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as ReceiptListItem[]
}

export async function fetchReceiptDetail(receiptId: string): Promise<ReceiptDetailResponse> {
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

  const itemsList = (items ?? []) as unknown as ReceiptDetailResponse['items']
  const total = itemsList.reduce((acc, i) => acc + (i.total ?? 0), 0)
  return {
    receipt: receipt as unknown as ReceiptDetailResponse['receipt'],
    items: itemsList,
    total,
  }
}

export async function createReceiptWithItems(input: {
  supplier_id?: number
  warehouse_id: number
  notes?: string
  receipt_number?: string
  items: Array<{ product_id: number; quantity: number; price?: number | null }>
}): Promise<{ receipt_id: string; receipt_number: string; items_inserted: number }> {
  const { data, error } = await supabase.rpc('rpc_create_receipt_with_items', {
    p_supplier_id: input.supplier_id ?? null,
    p_warehouse_id: input.warehouse_id,
    p_notes: input.notes ?? null,
    p_items: input.items,
    p_receipt_number: input.receipt_number?.trim() || null,
    p_user_id: null,
  })
  if (error) throw error
  const res = data as { success: boolean; error?: string; receipt_id: string; receipt_number: string; items_inserted: number }
  if (!res?.success) throw new Error(res?.error || 'Не вдалося створити накладну')
  return { receipt_id: res.receipt_id, receipt_number: res.receipt_number, items_inserted: res.items_inserted }
}

export async function confirmReceipt(receiptId: string): Promise<ConfirmReceiptResult> {
  const { data, error } = await supabase.rpc('confirm_receipt', {
    p_receipt_id: receiptId,
    p_user_id: null,
  })
  if (error) throw error
  return data as ConfirmReceiptResult
}

// ============================================================================
// ORDERS
// ============================================================================
export async function fetchOrders(options?: {
  status?: string; warehouseId?: number; shopId?: number
  source?: string; page?: number; pageSize?: number
}): Promise<PaginatedResponse<OrderListItem>> {
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

export async function fetchOrderDetail(orderId: string): Promise<OrderDetailResponse> {
  const { data, error } = await supabase.rpc('rpc_order_detail', {
    p_order_id: orderId,
  })
  if (error) throw error
  return data
}

export async function shipOrder(orderId: string): Promise<void> {
  const { data, error } = await supabase.rpc('ship_order', {
    p_order_id: orderId,
    p_user_id: null,
  })
  if (error) throw error
  return data
}

export async function updateOrderItem(itemId: string, quantity: number): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('order_update_item', {
    p_item_id: itemId,
    p_quantity: quantity,
  })
  if (error) throw error
  return data
}

export async function addOrderItem(orderId: string, productId: number, quantity: number): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('order_add_item', {
    p_order_id: orderId,
    p_product_id: productId,
    p_quantity: quantity,
  })
  if (error) throw error
  return data
}

export async function removeOrderItem(itemId: string): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('order_remove_item', {
    p_item_id: itemId,
  })
  if (error) throw error
  return data
}

export async function confirmOrder(orderId: string): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('order_confirm', {
    p_order_id: orderId,
    p_user_id: null,
  })
  if (error) throw error
  return data
}

// ============================================================================
// TRANSFERS / WRITE-OFFS / INVENTORY
// ============================================================================
export async function confirmTransfer(transferId: string): Promise<ConfirmTransferResult> {
  const { data, error } = await supabase.rpc('confirm_transfer', {
    p_transfer_id: transferId,
    p_user_id: null,
  })
  if (error) throw error
  return data as ConfirmTransferResult
}

export async function confirmWriteOff(writeOffId: string): Promise<ConfirmWriteOffResult> {
  const { data, error } = await supabase.rpc('confirm_write_off', {
    p_write_off_id: writeOffId,
    p_user_id: null,
  })
  if (error) throw error
  return data as ConfirmWriteOffResult
}

export async function completeInventory(inventoryId: string): Promise<CompleteInventoryResult> {
  const { data, error } = await supabase.rpc('complete_inventory', {
    p_inventory_id: inventoryId,
    p_user_id: null,
  })
  if (error) throw error
  return data as CompleteInventoryResult
}

export async function createInventory(input: { warehouse_id: number; notes?: string }): Promise<CreateInventoryResult> {
  const { data, error } = await supabase.rpc('rpc_create_inventory', {
    p_warehouse_id: input.warehouse_id,
    p_notes: input.notes ?? null,
    p_user_id: null,
  })
  if (error) throw error
  const res = data as CreateInventoryResult
  if (!res?.success) throw new Error(res?.error || 'Не вдалося створити інвентаризацію')
  return res
}

export async function fetchInventoryDetail(inventoryId: string): Promise<InventoryDetail> {
  const { data, error } = await supabase.rpc('rpc_inventory_detail', { p_inventory_id: inventoryId })
  if (error) throw error
  const res = data as InventoryDetail
  if (!res?.success) throw new Error(res?.error || 'Не вдалося завантажити')
  return res
}

export async function setInventoryActual(itemId: string, actual: number, notes?: string): Promise<SetActualResult> {
  const { data, error } = await supabase.rpc('rpc_inventory_set_actual', {
    p_item_id: itemId,
    p_actual_quantity: actual,
    p_notes: notes ?? null,
  })
  if (error) throw error
  const res = data as SetActualResult
  if (!res?.success) throw new Error(res?.error || 'Не вдалося оновити')
  return res
}

export async function addInventoryProduct(inventoryId: string, productId: number, actual: number): Promise<AddProductResult> {
  const { data, error } = await supabase.rpc('rpc_inventory_add_product', {
    p_inventory_id: inventoryId,
    p_product_id: productId,
    p_actual_quantity: actual,
  })
  if (error) throw error
  const res = data as AddProductResult
  if (!res?.success) throw new Error(res?.error || 'Не вдалося додати товар')
  return res
}

export async function inventoryResort(input: {
  inventory_id: string; from_product_id: number; to_product_id: number; quantity: number; notes?: string
}): Promise<ResortResult> {
  const { data, error } = await supabase.rpc('rpc_inventory_resort', {
    p_inventory_id: input.inventory_id,
    p_from_product_id: input.from_product_id,
    p_to_product_id: input.to_product_id,
    p_quantity: input.quantity,
    p_notes: input.notes ?? null,
  })
  if (error) throw error
  const res = data as ResortResult
  if (!res?.success) throw new Error(res?.error || 'Не вдалося зробити пересорт')
  return res
}

export async function cancelInventory(inventoryId: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('rpc_inventory_cancel', { p_inventory_id: inventoryId })
  if (error) throw error
  const res = data as { success: boolean; error?: string }
  if (!res?.success) throw new Error(res?.error || 'Не вдалося скасувати')
  return res
}

// ============================================================================
// GENERIC TABLE ACCESS (для аудиту та простих довідників)
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
export async function exportStockSummary(warehouseId?: number): Promise<StockSummaryItem[]> {
  return fetchStockSummary(warehouseId)
}

