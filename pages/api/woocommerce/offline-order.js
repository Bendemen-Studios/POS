import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { createHash } from 'crypto';
import { claimOrder, completeOrder, releaseOrder } from '../../../lib/orderIdempotency';
import { updateCustomerPoints } from '../../../lib/customerPoints';

function getClientOrderId(req) {
  const headerId = req.headers['idempotency-key'];
  if (headerId) return String(headerId).slice(0, 128);

  return createHash('sha256')
    .update(JSON.stringify(req.body || {}))
    .digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const clientOrderId = getClientOrderId(req);
  let claimed = false;

  const wcUrl = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || 'https://www.bendemen.com';
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;

  if (!consumerKey || !consumerSecret) {
    console.error('[OFFLINE ORDER ERROR]: WooCommerce API keys ontbreken in .env');
    return res.status(500).json({ success: false, retryable: true, error: 'Serverconfiguratiefout: WooCommerce API keys ontbreken in .env' });
  }

  try {
    const claim = await claimOrder(clientOrderId);

    if (claim.completed) {
      return res.status(200).json({ success: true, idempotent: true, order: { id: claim.wooOrderId } });
    }

    if (claim.processing) {
      return res.status(409).json({ success: false, retryable: true, error: 'Deze bestelling wordt al verwerkt.' });
    }

    claimed = claim.claimed;

    const { orderItems, paymentMethod, storeId, cashierId, customerId, totals, cashDetails, created_at } = req.body;

    const lineItems = [];
    const feeLines = [];

    (orderItems || []).forEach((item) => {
      const pid = Number(item.product_id || item.id);
      const isCustomItem = !pid || isNaN(pid) || pid === 0 || String(item.id).startsWith('custom_');

      if (isCustomItem) {
        feeLines.push({
          name: item.name || item.title || 'Custom Artikel',
          total: (parseFloat(item.price || 0) * (item.quantity || 1)).toFixed(2),
          tax_class: '',
          tax_status: 'none'
        });
      } else {
        const lineObj = {
          product_id: pid,
          quantity: item.quantity || 1,
          total: (parseFloat(item.price || 0) * (item.quantity || 1)).toFixed(2)
        };
        if (item.variation_id && Number(item.variation_id) > 0) lineObj.variation_id = Number(item.variation_id);
        lineItems.push(lineObj);
      }
    });

    if (totals?.discountAmount > 0) {
      feeLines.push({
        name: 'Handmatige Korting',
        total: `-${parseFloat(totals.discountAmount).toFixed(2)}`,
        tax_class: '',
        tax_status: 'none'
      });
    }

    if (totals?.pointsDiscount > 0) {
      feeLines.push({
        name: 'Punten Ingewisseld',
        total: `-${parseFloat(totals.pointsDiscount).toFixed(2)}`,
        tax_class: '',
        tax_status: 'none'
      });
    }

    const paymentTitle = paymentMethod === 'cash'
      ? 'Contant (Offline Gesynchroniseerd)'
      : (paymentMethod === 'manual_pin' ? 'Handmatige Pin (Offline Gesynchroniseerd)' : 'SumUp Pin (Offline Gesynchroniseerd)');

    const orderData = {
      payment_method: paymentMethod || 'pos_offline',
      payment_method_title: paymentTitle,
      set_paid: true,
      status: 'completed',
      customer_id: customerId ? Number(customerId) : 0,
      line_items: lineItems,
      fee_lines: feeLines,
      meta_data: [
        { key: '_pos_store_id', value: String(storeId || 1) },
        { key: '_pos_cashier_id', value: String(cashierId || 1) },
        { key: '_pos_payment_type', value: String(paymentMethod) },
        { key: '_pos_offline_synced', value: 'true' },
        { key: '_pos_original_created_at', value: String(created_at || new Date().toISOString()) },
        { key: '_pos_client_order_id', value: clientOrderId }
      ]
    };

    if (cashDetails && paymentMethod === 'cash') {
      orderData.meta_data.push(
        { key: '_pos_cash_given', value: String(cashDetails.cashGiven || 0) },
        { key: '_pos_change_due', value: String(cashDetails.changeDue || 0) }
      );
    }

    let responseOrder;

    try {
      const WooCommerce = new WooCommerceRestApi({ url: wcUrl, consumerKey, consumerSecret, version: 'wc/v3' });
      const { data } = await WooCommerce.post('orders', orderData);
      responseOrder = data;
    } catch (sdkError) {
      console.warn('[OFFLINE ORDER]: SDK faalt, schakelt over naar fetch fallback...', sdkError?.message);
      const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
      const fetchRes = await fetch(`${wcUrl}/wp-json/wc/v3/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
        body: JSON.stringify(orderData)
      });
      const fetchText = await fetchRes.text();
      if (!fetchRes.ok) throw new Error(`WooCommerce HTTP ${fetchRes.status}: ${fetchText}`);
      responseOrder = JSON.parse(fetchText);
    }

    if (!responseOrder?.id) throw new Error('WooCommerce gaf geen order-ID terug.');

    if (claimed) await completeOrder(clientOrderId, responseOrder.id);

    let pointsSyncPending = false;
    if (customerId && Number.isFinite(Number(customerId)) && Number(customerId) > 0) {
      try {
        await updateCustomerPoints({
          customerId: Number(customerId),
          pointsUsed: totals?.pointsUsed || 0,
          totalPaid: totals?.totalPaid || 0,
        });
      } catch (pointsError) {
        pointsSyncPending = true;
        console.error('[OFFLINE ORDER POINTS SYNC]:', pointsError.message);
      }
    }

    return res.status(200).json({ success: true, order: responseOrder, pointsSyncPending });
  } catch (error) {
    if (claimed) {
      try { await releaseOrder(clientOrderId); } catch (releaseError) {
        console.error('[OFFLINE IDEMPOTENCY RELEASE ERROR]:', releaseError.message);
      }
    }

    console.error('[OFFLINE ORDER SYNC ERROR]:', error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      retryable: true,
      error: error?.response?.data?.message || error.message || 'Fout bij verwerken van offline bestelling.'
    });
  }
}
