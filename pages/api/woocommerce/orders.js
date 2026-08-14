import axios from 'axios';
import { saveOfflineOrder } from '../../../lib/db';

// WooCommerce API Credentials vanuit .env
const WOO_URL = process.env.WOO_URL;
const WOO_CONSUMER_KEY = process.env.WOO_CONSUMER_KEY;
const WOO_CONSUMER_SECRET = process.env.WOO_CONSUMER_SECRET;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  }

  const orderPayload = req.body;

  if (!orderPayload || !orderPayload.orderItems || orderPayload.orderItems.length === 0) {
    return res.status(400).json({ success: false, error: 'Geen producten gevonden in de bestelling.' });
  }

  try {
    // 1. Formatteer de bestelling voor de WooCommerce REST API
    const lineItems = orderPayload.orderItems.map(item => {
      const lineItem = {
        product_id: item.id,
        quantity: item.quantity,
        price: item.price.toString()
      };

      // Voeg variaties toe indien aanwezig
      if (item.selectedAttributes) {
        lineItem.meta_data = Object.entries(item.selectedAttributes).map(([key, value]) => ({
          key: key,
          value: value
        }));
      }

      return lineItem;
    });

    // Bereken eventuele kortingen of extra's
    const feeLines = [];
    if (orderPayload.totals?.discountAmount > 0) {
      feeLines.push({
        name: 'Kassa Korting',
        total: (-Math.abs(orderPayload.totals.discountAmount)).toFixed(2)
      });
    }

    const wooOrderData = {
      payment_method: orderPayload.paymentMethod === 'sumup' ? 'sumup_pin' : (orderPayload.paymentMethod === 'cash' ? 'cash' : 'manual_pin'),
      payment_method_title: orderPayload.paymentMethod === 'sumup' ? 'SumUp PIN' : (orderPayload.paymentMethod === 'cash' ? 'Contant' : 'Handmatige PIN'),
      set_paid: true, // Markeer direct als betaald
      status: 'completed', // Direct afgerond in de winkel
      line_items: lineItems,
      fee_lines: feeLines,
      customer_id: orderPayload.customerId || 0,
      meta_data: [
        { key: '_pos_store_id', value: String(orderPayload.storeId || 1) },
        { key: '_pos_cashier_id', value: String(orderPayload.cashierId || 1) },
        { key: '_pos_cash_given', value: String(orderPayload.totals?.cashGiven || 0) },
        { key: '_pos_change_amount', value: String(orderPayload.totals?.changeAmount || 0) }
      ]
    };

    // 2. Probeer de order direct naar WooCommerce te sturen via Basic Auth
    const wooResponse = await axios.post(
      `${WOO_URL}/wp-json/wc/v3/orders`,
      wooOrderData,
      {
        auth: {
          username: WOO_CONSUMER_KEY,
          password: WOO_CONSUMER_SECRET
        },
        timeout: 8000 // 8 seconden timeout
      }
    );

    if (wooResponse.data && wooResponse.data.id) {
      return res.status(200).json({
        success: true,
        orderId: wooResponse.data.id,
        message: 'Bestelling succesvol geplaatst in WooCommerce!'
      });
    } else {
      throw new Error('Geen geldig antwoord ontvangen van WooCommerce.');
    }

  } catch (error) {
    console.error('Fout bij verzenden naar WooCommerce (valt terug op offline opslag in MariaDB):', error.message);

    // 3. Fallback: Als WooCommerce onbereikbaar is, sla de order veilig op in MariaDB
    try {
      const localInsertId = await saveOfflineOrder(orderPayload);
      return res.status(200).json({
        success: true,
        offline: true,
        orderId: `LOCAL-${localInsertId}`,
        message: 'Webshop onbereikbaar. Bestelling lokaal opgeslagen in MariaDB voor latere synchronisatie.'
      });
    } catch (dbError) {
      console.error('Kritieke fout bij opslaan in MariaDB:', dbError.message);
      return res.status(500).json({ 
        success: false, 
        error: 'Kan bestelling niet verwerken (zowel WooCommerce als lokale database gaven een fout).' 
      });
    }
  }
}