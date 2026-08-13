// lib/db.js
import Dexie from 'dexie';

// 1. Maak de Bendemen POS database aan in de browser
export const db = new Dexie('BendemenPOSDatabase');

// 2. Definieer de tabellen (stores) en de "zoekbare" indexen
// Let op: je hoeft hier niet élk veld (zoals orderItems of totals) te benoemen, 
// alleen de velden waarop we willen zoeken of filteren (zoals id en status).
db.version(1).stores({
  products: 'id, name, sku, price, stock_quantity', 
  orders: '++id, status, is_synced, offline_created_at', 
  users: 'id, store_id, role, name', 
  customers: 'id, name, email, points_balance' 
});

// 3. De hulp-functie om een offline order netjes op te slaan
// Alles wat de kassa meegeeft (orderData) gooien we in de database, 
// met de toevoeging dat het de status 'pending_sync' (wachtend op sync) krijgt.
export async function saveOfflineOrder(orderData) {
  return await db.orders.add({
    ...orderData,
    status: 'pending_sync',
    is_synced: 0,
    offline_created_at: new Date().toISOString()
  });
}