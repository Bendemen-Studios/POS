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


async function findExistingWooOrder(url, authHeader, clientOrderId) {
  const targetId = String(clientOrderId).slice(0, 128);
  try {
    // Inspect recent orders and their actual meta_data instead of relying on
    // meta_key/meta_value query parameters supported differently by servers.
    const query = new URLSearchParams({ per_page: '100', orderby: 'date', order: 'desc' });
    const response = await fetchWithTimeout(
      `${url}/wp-json/wc/v3/orders?${query.toString()}`,
      {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          'User-Agent': 'BDM-POS-Client/1.0 (Mozilla/5.0; Node.js)',
          Connection: 'close',
        },
      },
      7000
    );
    if (!response.ok) return null;
    const orders = await response.json().catch(() => []);
    if (!Array.isArray(orders)) return null;
    return orders.find(order =>
      Array.isArray(order?.meta_data) &&
      order.meta_data.some(meta =>
        String(meta?.key || '') === '_pos_client_order_id' &&
        String(meta?.value || '') === targetId
      )
    ) || null;
  } catch (_) {
    return null;
  }
}

async function verifyWooOrder(url, authHeader, wooOrderId) {
  try {
    const response = await fetchWithTimeout(
      `${url}/wp-json/wc/v3/orders/${encodeURIComponent(String(wooOrderId))}`,
      {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          'User-Agent': 'BDM-POS-Client/1.0 (Mozilla/5.0; Node.js)',
          Connection: 'close',
        },
      },
      7000
    );
    if (response.status === 404) return { exists: false, unavailable: false };
    if (!response.ok) return { exists: false, unavailable: true };
    const order = await response.json().catch(() => null);
    return { exists: !!order?.id, unavailable: false, order };
  } catch (_) {
    return { exists: false, unavailable: true };
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
      // Verify the WooCommerce order before reporting success. A stale local
      // idempotency record must never make the POS drop an offline order.
      const completedOrderCheck = await verifyWooOrder(
        url,
        'Basic ' + Buffer.from(consumerKey + ':' + consumerSecret).toString('base64'),
        claim.wooOrderId
      );
      if (completedOrderCheck.exists && completedOrderCheck.order?.status === 'completed') {
        return res.status(200).json({ success: true, idempotent: true, order: completedOrderCheck.order });
      }
      if (completedOrderCheck.unavailable) {
        return res.status(503).json({ success: false, retryable: true, error: 'WooCommerce is tijdelijk niet bereikbaar. De offline bestelling blijft in de wachtrij.' });
      }
      await releaseOrder(clientOrderId);
      claimed = true;
    }

    if (claim.processing) {
      return res.status(409).json({ success: false, retryable: true, error: 'Deze bestelling wordt al verwerkt.' });
    }

    claimed = claim.claimed;

    const { orderItems, paymentMethod, storeId, cashierId, customerId, totals, cashDetails, created_at } = req.body;
    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    // A client may retry after a timeout even though WooCommerce already created
    // the order. Always check WooCommerce before creating another order.
    const existingOrder = await findExistingWooOrder(url, authHeader, clientOrderId);
    if (existingOrder?.id) {
      await completeOrder(clientOrderId, existingOrder.id);
      return res.status(200).json({ success: true, idempotent: true, order: existingOrder });
    }
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
      // Create the POS order as paid + completed in one WooCommerce request.
      // This removes the extra sequential PUT request that previously made checkout feel slow.
      set_paid: true,
      status: 'completed',
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
      // Never issue a second WooCommerce POST after an uncertain timeout.
      // The original request may have reached WooCommerce successfully.
      const existingAfterError = await findExistingWooOrder(url, authHeader, clientOrderId);
      if (existingAfterError?.id) {
        responseOrder = existingAfterError;
      } else {
        throw new Error(`WooCommerce checkout niet bevestigd: ${fetchErr.message}`);
      }
    }

    if (!responseOrder?.id) throw new Error('WooCommerce gaf geen order-ID terug.');



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