// hooks/useOfflineSync.js
import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import axios from 'axios';

export function useOfflineSync() {
  const [isSyncingOrders, setIsSyncingOrders] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);

  // Tel hoeveel orders nog gesynct moeten worden
  const checkUnsyncedOrders = async () => {
    const count = await db.orders.where('status').equals('pending_sync').count();
    setUnsyncedCount(count);
  };

  // Deze functie pakt alle offline orders op en stuurt ze naar de API
  const syncOfflineOrders = async () => {
    if (isSyncingOrders) return; // Voorkom dat hij 2x tegelijk draait
    
    setIsSyncingOrders(true);
    
    try {
      // Haal alle orders op die de status 'pending_sync' hebben
      const pendingOrders = await db.orders.where('status').equals('pending_sync').toArray();

      if (pendingOrders.length === 0) {
        setIsSyncingOrders(false);
        return; 
      }

      console.log(`Sync Manager: Bezig met synchroniseren van ${pendingOrders.length} orders...`);

      for (const order of pendingOrders) {
        try {
          // Stuur de opgeslagen data naar onze eigen WooCommerce API
          const response = await axios.post('/api/woocommerce/order', {
            orderItems: order.orderItems,
            paymentMethod: order.paymentMethod,
            storeId: order.storeId,
            cashierId: order.cashierId,
            customerId: order.customerId,
            totals: order.totals
          });

          if (response.data.success) {
            // Als de API success meldt, updaten we de order in Dexie
            await db.orders.update(order.id, {
              status: 'synced',
              is_synced: 1,
              woo_order_id: response.data.orderId
            });
            console.log(`Order ${order.id} succesvol gesynct!`);
          }
        } catch (error) {
          console.error(`Fout bij syncen van order ${order.id}:`, error);
          // Als één order faalt (bijv. server error), gaat hij verder met de rest
        }
      }

      // Update de teller in de kassa
      checkUnsyncedOrders();
    } catch (error) {
      console.error("Fout in het sync-proces:", error);
    } finally {
      setIsSyncingOrders(false);
    }
  };

  // Lifecycle listeners
  useEffect(() => {
    // Check direct bij het openen van de app of er nog orders staan
    checkUnsyncedOrders();

    // Als de browser weer online komt, trigger de sync!
    const handleOnline = () => {
      console.log("Internet is terug! Start automatische sync...");
      syncOfflineOrders();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return { isSyncingOrders, unsyncedCount, syncOfflineOrders, checkUnsyncedOrders };
}