import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { createHash } from 'crypto';
import { claimOrder, completeOrder, releaseOrder } from '../../../lib/orderIdempotency';
import { redeemCustomerPoints } from '../../../lib/customerPoints';

function getClientOrderId(req) {
  const headerId = req.headers['idempotency-key'];
  if (headerId) return String(headerId).slice(0, 128);

  return createHash('sha256')
    .update(JSON.stringify(req.body || {}))
    .digest('hex');
}

async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url, options, timeoutMs = 15000) {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`);
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const clientOrderId = getClientOrderId(req);
  let claimed = false;
  const url = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || 'https://www.bendemen.com';
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;

  if (!consumerKey || !consumerSecret) {
    return res.status(500).json({ success: false, error: 'WooCommerce API sleutels zijn niet geconfigureerd in .env' });
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
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const customHeaders = {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      'User-Agent': 'BDM-POS-Client/1.0 (Mozilla/5.0; Node.js)',
      Connection: 'close'
    };

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
      ? 'Contant (Kassa Direct)'
      : (paymentMethod === 'manual_pin' ? 'Handmatige Pin (Kassa Direct)' : 'SumUp Pin (Kassa Direct)');

    const orderData = {
      payment_method: paymentMethod || 'pos_checkout',
      payment_method_title: paymentTitle,
      set_paid: false,
      status: 'pending',
      customer_id: customerId ? Number(customerId) : 0,
      line_items: lineItems,
      fee_lines: feeLines,
      meta_data: [
        { key: '_pos_store_id', value: String(storeId || 1) },
        { key: '_pos_cashier_id', value: String(cashierId || 1) },
        { key: '_pos_payment_type', value: String(paymentMethod) },
        { key: '_pos_direct_checkout', value: 'true' },
        { key: '_pos_created_at', value: String(created_at || new Date().toISOString()) },
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
      const fetchRes = await fetchWithTimeout(`${url}/wp-json/wc/v3/orders`, {
        method: 'POST',
        headers: customHeaders,
        body: JSON.stringify(orderData)
      }, 15000);
      const responseText = await fetchRes.text();
      if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status}: ${responseText}`);
      responseOrder = JSON.parse(responseText);
    } catch (fetchErr) {
      console.warn('[CHECKOUT API]: Native fetch faalt/time-out, probeert SDK fallback...', fetchErr.message);
      const api = new WooCommerceRestApi({
        url,
        consumerKey,
        consumerSecret,
        version: 'wc/v3',
        axiosConfig: { timeout: 15000, headers: customHeaders }
      });
      const { data } = await api.post('orders', orderData);
      responseOrder = data;
    }

    if (!responseOrder?.id) throw new Error('WooCommerce gaf geen order-ID terug.');

    try {
      // Mark the POS order as actually paid as part of the transition to
      // completed. This is required for WooCommerce payment-completion hooks,
      // including WooCommerce Points & Rewards, to award earned points.
      const completeData = { status: 'completed', set_paid: true };
      const completeRes = await fetchWithTimeout(`${url}/wp-json/wc/v3/orders/${responseOrder.id}`, {
        method: 'PUT',
        headers: customHeaders,
        body: JSON.stringify(completeData)
      }, 15000);
      const completeText = await completeRes.text();
      if (!completeRes.ok) throw new Error(`HTTP ${completeRes.status}: ${completeText}`);
      responseOrder = JSON.parse(completeText);
    } catch (completeErr) {
      console.warn('[CHECKOUT API]: Direct complete faalt/time-out, probeert SDK fallback...', completeErr.message);
      const api = new WooCommerceRestApi({
        url,
        consumerKey,
        consumerSecret,
        version: 'wc/v3',
        axiosConfig: { timeout: 15000, headers: customHeaders }
      });
      const { data } = await api.put(`orders/${responseOrder.id}`, { status: 'completed', set_paid: true });
      responseOrder = data;
    }

    if (!responseOrder?.id || responseOrder.status !== 'completed') {
      throw new Error('WooCommerce kon de POS-bestelling niet naar completed zetten.');
    }

    // WooCommerce Points & Rewards now handles earned points from the completed
    // and paid order. The POS only performs the separate redemption when points were used.
    let pointsSyncPending = false;
    let pointsResult = null;
    if (customerId && Number.isFinite(Number(customerId)) && Number(customerId) > 0 && Number(totals?.pointsUsed || 0) > 0) {
      try {
        pointsResult = await redeemCustomerPoints({
          customerId: Number(customerId),
          pointsUsed: Number(totals.pointsUsed),
          orderId: Number(responseOrder.id),
        });
      } catch (pointsError) {
        pointsSyncPending = true;
        console.error('[CHECKOUT POINTS REDEEM]:', pointsError.message);
      }
    }

    if (claimed) await completeOrder(clientOrderId, responseOrder.id);

    return res.status(200).json({ success: true, order: responseOrder, pointsSyncPending, pointsResult });
  } catch (error) {
    if (claimed) {
      try { await releaseOrder(clientOrderId); } catch (releaseError) {
        console.error('[CHECKOUT IDEMPOTENCY RELEASE ERROR]:', releaseError.message);
      }
    }
    console.error('[CHECKOUT API ERROR]:', error);
    return res.status(500).json({ success: false, error: error.message || 'Checkout mislukt.' });
  }
}