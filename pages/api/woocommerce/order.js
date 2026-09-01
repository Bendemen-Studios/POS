import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import { updateCustomerPoints } from "../../../lib/customerPoints";

const WooCommerce = WooCommerceRestApi.default || WooCommerceRestApi;
const api = new WooCommerce({
  url: process.env.WOO_SITE_URL || process.env.WOOCOMMERCE_URL || "https://www.bendemen.com",
  consumerKey: process.env.WOO_CONSUMER_KEY || process.env.WOOCOMMERCE_CONSUMER_KEY,
  consumerSecret: process.env.WOO_CONSUMER_SECRET || process.env.WOOCOMMERCE_CONSUMER_SECRET,
  version: "wc/v3"
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { orderItems = [], paymentMethod, storeId, cashierId, customerId, totals = {} } = req.body || {};

  try {
    const feeLines = [];
    const discountAmount = Number.parseFloat(totals.discountAmount) || 0;
    const pointsDiscount = Number.parseFloat(totals.pointsDiscount) || 0;
    if (discountAmount > 0) feeLines.push({ name: 'Kassa Korting (Handmatig)', total: `-${discountAmount.toFixed(2)}` });
    if (pointsDiscount > 0) feeLines.push({ name: 'Punten Ingewisseld', total: `-${pointsDiscount.toFixed(2)}` });

    const paymentTitle = paymentMethod === 'sumup' ? 'Pin (SumUp)' : paymentMethod === 'manual_pin' ? 'Pin (Handmatig)' : 'Contant (Kassa)';
    const orderData = {
      payment_method: paymentMethod === 'manual_pin' ? 'pin' : paymentMethod,
      payment_method_title: paymentTitle,
      set_paid: true,
      status: 'completed',
      customer_id: Number(customerId) || 0,
      line_items: orderItems.map(item => {
        const quantity = Number(item.quantity) || 1;
        const price = Number.parseFloat(item.price) || 0;
        const lineItem = { quantity, price: String(price), subtotal: String(price * quantity), total: String(price * quantity) };
        if (!item.product_id || String(item.id).startsWith('custom_')) lineItem.name = item.name;
        else { lineItem.product_id = item.product_id || item.id; lineItem.variation_id = item.variation_id || 0; }
        return lineItem;
      }),
      fee_lines: feeLines,
      meta_data: [
        { key: '_pos_store_id', value: storeId || 1 },
        { key: '_pos_cashier_id', value: cashierId || 1 },
        { key: '_created_via_bendemen_pos', value: 'yes' }
      ]
    };

    const response = await api.post("orders", orderData);
    const createdOrder = response.data;

    if (Number(customerId) > 0) {
      try {
        await updateCustomerPoints({
          customerId: Number(customerId),
          pointsUsed: totals.pointsUsed || 0,
          totalPaid: totals.totalPaid || 0,
        });
      } catch (pointsError) {
        console.error('Fout bij bijwerken spaarpunten:', pointsError.message);
      }
    }

    return res.status(200).json({ success: true, orderId: createdOrder.id });
  } catch (error) {
    console.error('WooCommerce API Error:', error.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'Fout bij aanmaken order in WooCommerce' });
  }
}
