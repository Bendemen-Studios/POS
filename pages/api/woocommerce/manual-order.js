import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { requireSession, requireStoreAccess } from '../../../lib/session';

const WooCommerce = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL || 'https://www.bendemen.com',
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET,
  version: 'wc/v3',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  if (!requireStoreAccess(req, res, (req.body || {}).storeId || 1)) return;

  const { orderItems = [], paymentMethod, storeId, cashierId, customerId, totals = {}, cashDetails } = req.body || {};
  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    return res.status(400).json({ success: false, error: 'De bestelling bevat geen artikelen.' });
  }

  try {
    const lineItems = [];
    const customFeeLines = [];
    for (const item of orderItems) {
      const price = Number(item?.price);
      const quantity = item?.quantity == null ? 1 : Number(item.quantity);
      if (!item || !Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ success: false, error: 'Een artikel heeft een ongeldige prijs of hoeveelheid.' });
      }
      const productId = Number(item.product_id || item.id);
      const isCustomItem = String(item.id || '').startsWith('custom_') || !Number.isInteger(productId) || productId <= 0;
      if (isCustomItem) {
        customFeeLines.push({
          name: item.name || 'Custom Artikel',
          total: (price * quantity).toFixed(2),
          tax_class: '',
          tax_status: 'none'
        });
        continue;
      }
      const lineItemObj = {
        product_id: productId,
        quantity,
        subtotal: (price * quantity).toFixed(2),
        total: (price * quantity).toFixed(2)
      };
      if (item.variation_id && Number(item.variation_id) > 0) lineItemObj.variation_id = Number(item.variation_id);
      lineItems.push(lineItemObj);
    }

    const paymentTitle = paymentMethod === 'cash' 
      ? 'Contante Betaling (POS)' 
      : (paymentMethod === 'manual_pin' ? 'Handmatige Pin (POS)' : 'Kassa Betaling (POS)');

    const orderData = {
      payment_method: paymentMethod || 'pos_manual',
      payment_method_title: paymentTitle,
      set_paid: true,
      status: 'completed',
      customer_id: customerId ? parseInt(customerId) : 0,
      line_items: lineItems,
      fee_lines: [
        ...customFeeLines,
        ...(Number(totals?.discountAmount) > 0 ? [{
          name: 'Handmatige Korting',
          total: `-${Number(totals.discountAmount).toFixed(2)}`,
          tax_class: '',
          tax_status: 'none'
        }] : []),
        ...(Number(totals?.pointsDiscount) > 0 ? [{
          name: 'Punten Ingewisseld',
          total: `-${Number(totals.pointsDiscount).toFixed(2)}`,
          tax_class: '',
          tax_status: 'none'
        }] : [])
      ],
      meta_data: [
        { key: '_pos_store_id', value: String(storeId || 1) },
        { key: '_pos_cashier_id', value: String(cashierId || 1) },
        { key: '_pos_payment_type', value: String(paymentMethod) }
      ]
    };

    if (cashDetails && paymentMethod === 'cash') {
      orderData.meta_data.push(
        { key: '_pos_cash_given', value: String(cashDetails.cashGiven || 0) },
        { key: '_pos_change_due', value: String(cashDetails.changeDue || 0) }
      );
    }

    const response = await WooCommerce.post('orders', orderData);

    res.status(200).json({ success: true, order: response.data });
  } catch (error) {
    console.error('WooCommerce API Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Fout bij aanmaken van de bestelling in WooCommerce' });
  }
}