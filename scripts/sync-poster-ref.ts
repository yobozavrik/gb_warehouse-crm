// Скрипт: синхронизация справочников магазинов и складов из Poster
// Запуск: npx tsx scripts/sync-poster-ref.ts

const POSTER_TOKEN = '526379:9669514747b2a48f329dac43b6997c42'
const POSTER_ACCOUNT = 'galia-baluvana34'
const POSTER_API = 'https://joinposter.com/api'

const SUPABASE_URL = 'https://supabase.dmytrotovstytskyi.online'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')

interface PosterSpot {
  spot_id: string
  spot_name: string
  spot_address: string
}

interface PosterStorage {
  storage_id: string
  storage_name: string
  storage_address: string
  spot_id: string | null
}

async function posterGet<T>(method: string): Promise<T> {
  const url = `${POSTER_API}/${method}?token=${POSTER_TOKEN}&account=${POSTER_ACCOUNT}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.error) throw new Error(`Poster error: ${JSON.stringify(data.error)}`)
  return data.response
}

async function main() {
  console.log('Fetching spots from Poster...')
  const spots = await posterGet<PosterSpot[]>('access.getSpots')
  console.log(`Found ${spots.length} spots`)

  console.log('Fetching storages from Poster...')
  const storages = await posterGet<PosterStorage[]>('storage.getStorages')
  console.log(`Found ${storages.length} storages`)

  // === WAREHOUSES ===
  // Central/transit warehouses (those NOT linked to a spot)
  const centralStorages = storages.filter(s => !s.spot_id || s.spot_id === '0')
  // Shop warehouses (those linked to a spot)
  const shopStorages = storages.filter(s => s.spot_id && s.spot_id !== '0')

  console.log(`\n=== WAREHOUSES (${storages.length} total) ===`)
  for (const s of storages) {
    console.log(`  [${s.storage_id}] ${s.storage_name} | spot_id: ${s.spot_id} | address: ${s.storage_address}`)
  }

  console.log(`\n=== SPOTS/SHOPS (${spots.length} total) ===`)
  for (const s of spots) {
    console.log(`  [${s.spot_id}] ${s.spot_name} | ${s.spot_address}`)
  }

  // === Build mapping: which storage belongs to which shop ===
  console.log(`\n=== STORAGE-SHOP MAPPING ===`)
  for (const st of storages) {
    if (st.spot_id && st.spot_id !== '0') {
      const spot = spots.find(s => s.spot_id === st.spot_id)
      console.log(`  Storage "${st.storage_name}" (${st.storage_id}) -> Shop "${spot?.spot_name}" (spot ${st.spot_id})`)
    } else {
      console.log(`  Storage "${st.storage_name}" (${st.storage_id}) -> CENTRAL WAREHOUSE`)
    }
  }

  // === UPSERT TO SUPABASE ===
  console.log('\n=== Upserting to Supabase... ===')

  for (const st of storages) {
    const isCentral = !st.spot_id || st.spot_id === '0'

    const warehouseBody = {
      name: st.storage_name,
      type: isCentral ? 'central' : 'shop',
      address: st.storage_address || null,
    }

    // Upsert warehouse by name
    const whRes = await fetch(`${SUPABASE_URL}/rest/v1/household_chemicals/warehouses?name=eq.${encodeURIComponent(st.storage_name)}`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    })
    const existing = await whRes.json()

    let warehouseId: number
    if (existing.length > 0) {
      // Update existing
      await fetch(`${SUPABASE_URL}/rest/v1/household_chemicals/warehouses?id=eq.${existing[0].id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(warehouseBody),
      })
      warehouseId = existing[0].id
      console.log(`  Updated warehouse: ${st.storage_name} (id=${warehouseId})`)
    } else {
      // Create new
      const createRes = await fetch(`${SUPABASE_URL}/rest/v1/household_chemicals/warehouses`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(warehouseBody),
      })
      const created = await createRes.json()
      warehouseId = created[0]?.id
      console.log(`  Created warehouse: ${st.storage_name} (id=${warehouseId})`)
    }

    // If this storage is linked to a spot, create/update the shop
    if (st.spot_id && st.spot_id !== '0') {
      const spot = spots.find(s => s.spot_id === st.spot_id)
      if (spot) {
        const shopBody = {
          name: spot.spot_name,
          warehouse_id: warehouseId,
          poster_spot_id: parseInt(st.spot_id),
          address: spot.spot_address || st.storage_address || null,
        }

        const shopRes = await fetch(`${SUPABASE_URL}/rest/v1/household_chemicals/shops?name=eq.${encodeURIComponent(spot.spot_name)}`, {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
          },
        })
        const shopExisting = await shopRes.json()

        if (shopExisting.length > 0) {
          await fetch(`${SUPABASE_URL}/rest/v1/household_chemicals/shops?id=eq.${shopExisting[0].id}`, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(shopBody),
          })
          console.log(`  Updated shop: ${spot.spot_name}`)
        } else {
          await fetch(`${SUPABASE_URL}/rest/v1/household_chemicals/shops`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(shopBody),
          })
          console.log(`  Created shop: ${spot.spot_name}`)
        }
      }
    }
  }

  console.log('\nDone!')
}

main().catch(console.error)
