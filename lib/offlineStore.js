import { get, set } from 'idb-keyval';

const OFFLINE_ORDERS_KEY = 'bendemen_offline_orders';

// Sla een order lokaal op als de server offline is
export async function saveOfflineOrder(orderData) {
  const existing = (await get(OFFLINE_ORDERS_KEY)) || [];
  const localOrder = {
    ...orderData,
    localId: `OFFLINE-${Date.now()}`,
    createdAt: new Date().toISOString()
  };
  existing.push(localOrder);
  await set(OFFLINE_ORDERS_KEY, existing);
  return localOrder;
}

// Haal alle niet-gesynchroniseerde orders op
export async function getOfflineOrders() {
  return (await get(OFFLINE_ORDERS_KEY)) || [];
}

// Wis verwerkte orders
export async function clearOfflineOrders() {
  await set(OFFLINE_ORDERS_KEY, []);
}