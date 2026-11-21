import { createHash } from 'crypto';
import { claimOrder, completeOrder, releaseOrder } from '../../../lib/orderIdempotency';
import { redeemCustomerPoints } from '../../../lib/customerPoints';
import { requireSession, requireStoreAccess } from '../../../lib/session';
import { callBdmposWooApi } from '../../../lib/bdmpos-core';

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
  let orders;

  // Prefer the authenticated Core gateway: the direct VPS-to-webshop route
  // is currently timing out before an HTTP connection can be established.
  if (process.env.BDMPOS_CORE_URL && process.env.BDMPOS_CORE_SECRET) {
    const result = await callBdmposWooApi({
      method: 'GET',
      path: '/orders',
      params: { per_page: 100, orderby: 'date', order: 'desc' }
    });
    orders = result.data;
  } else {
    const query = new URLSearchParams({ per_page: '100', orderby: 'date', order: 'desc' });
    const response = await fetchWithTimeout(
      url + '/wp-json/wc/v3/orders?' + query.toString(),
      {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          'User-Agent': 'BDM-POS-Server/1.0',
          Connection: 'close',
        },
      },
      20000
    );
    if (!response.ok) {
      throw new Error('WooCommerce kon bestaande bestellingen niet controleren (HTTP ' + response.status + ').');
    }
    orders = await response.json();
  }

  if (!Array.isArray(orders)) {
    throw new Error('WooCommerce gaf een ongeldige lijst met bestaande bestellingen terug.');
  }
  return orders.find(order =>
    Array.isArray(order?.meta_data) &&
    order.meta_data.some(meta =>
      String(meta?.key || '') === '_pos_client_order_id' &&
      String(meta?.value || '') === targetId
    )
  ) || null;
}

async function verifyWooOrder(url, authHeader, wooOrderId) {
  try {
    if (process.env.BDMPOS_CORE_URL && process.env.BDMPOS_CORE_SECRET) {
      const result = await callBdmposWooApi({
        method: 'GET',
        path: '/orders/' + encodeURIComponent(String(wooOrderId))
      });
      const order = result.data;
      return { exists: !!order?.id, unavailable: false, order };
    }
    const response = await fetchWithTimeout(
      url + '/wp-json/wc/v3/orders/' + encodeURIComponent(String(wooOrderId)),
      {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          'User-Agent': 'BDM-POS-Server/1.0',
          Connection: 'close',
        },
      },
      7000
    );
    if (response.status === 404) return { exists: false, unavailable: false };
    if (!response.ok) return { exists: false, unavailable: true };
    const order = await response.json().catch(() => null);
    return { exists: !!order?.id, unavailable: false, order };
  } catch (error) {
    if (error?.response?.status === 404) return { exists: false, unavailable: false };
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

  const session = await requireSession(req, res);
  if (!session) return;

  if (!requireStoreAccess(req, res, (req.body || {}).storeId || 1)) return;

  const clientOrderId = getClientOrderId(req);
  let claimed = false;
  const url = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || 'https://www.bendemen.com';
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOO_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOO_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;

  const useBdmposCore = Boolean(process.env.BDMPOS_CORE_URL && process.env.BDMPOS_CORE_SECRET);
  if (!useBdmposCore && (!consumerKey || !consumerSecret)) {
    return res.status(500).json({ success: false, error: 'WooCommerce API sleutels zijn niet geconfigureerd in .env' });
  }

  // Build this before claiming the order: the processing-retry branch also
  // needs it to check whether WooCommerce already created the order.
  const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  const body = req.body || {};
  const { orderItems, paymentMethod } = body;
  const totals = body.totals && typeof body.totals === 'object' ? body.totals : {};
  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    return res.status(400).json({ success: false, error: 'De bestelling bevat geen artikelen.' });
  }
  if (!['cash', 'manual_pin', 'sumup'].includes(paymentMethod)) {
    return res.status(400).json({ success: false, error: 'Kies een geldige betaalmethode voordat de bestelling wordt verwerkt.' });
  }

  let subtotal = 0;
  for (const item of orderItems) {
    if (!item || typeof item !== 'object') {
      return res.status(400).json({ success: false, error: 'De bestelling bevat een ongeldig artikel.' });
    }
    const price = Number(item.price);
    const quantity = item.quantity == null ? 1 : Number(item.quantity);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Een artikel heeft een ongeldige prijs of hoeveelheid.' });
    }
    const isCustomItem = String(item.id || '').startsWith('custom_') || (!item.product_id && !Number.isFinite(Number(item.id)));
    const productId = Number(item.product_id || item.id);
    if (!isCustomItem && (!Number.isInteger(productId) || productId <= 0)) {
      return res.status(400).json({ success: false, error: 'Een artikel heeft geen geldig WooCommerce-product-ID.' });
    }
    subtotal += price * quantity;
  }

  const discountAmount = Number(totals.discountAmount || 0);
  const pointsDiscount = Number(totals.pointsDiscount || 0);
  if (!Number.isFinite(discountAmount) || discountAmount < 0 ||
      !Number.isFinite(pointsDiscount) || pointsDiscount < 0 ||
      Math.round(discountAmount * 100) + Math.round(pointsDiscount * 100) > Math.round(subtotal * 100)) {
    return res.status(400).json({ success: false, error: 'De korting is ongeldig of hoger dan het bestelbedrag.' });
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
      // A previous request may still be finishing after the POS timed out.
      // Check WooCommerce before returning 409 so a manual retry can recover
      // the already-created order instead of creating a duplicate later.
      const processingOrder = await findExistingWooOrder(url, authHeader, clientOrderId);
      if (processingOrder?.id && processingOrder.status === 'completed') {
        await completeOrder(clientOrderId, processingOrder.id);
        return res.status(200).json({ success: true, idempotent: true, order: processingOrder });
      }
      return res.status(409).json({ success: false, retryable: true, error: 'Deze bestelling wordt al verwerkt.' });
    }

    claimed = claim.claimed;

    const { orderItems, paymentMethod, storeId, cashierId, customerId, totals, cashDetails, created_at } = req.body;

    // Queue transport already sends a stable request id. A pre-create search
    // would wait for a second WordPress poll and blow the cashier timeout.
    const queueTransport = String(process.env.BDMPOS_CORE_TRANSPORT || 'queue').trim().toLowerCase() !== 'direct';
    const existingOrder = (useBdmposCore && queueTransport)
      ? null
      : await findExistingWooOrder(url, authHeader, clientOrderId);
    if (existingOrder?.id) {
      if (existingOrder.status !== 'completed') {
        throw new Error(`WooCommerce-bestelling #${existingOrder.id} bestaat, maar heeft status '${existingOrder.status || 'onbekend'}'. De bestelling blijft in de wachtrij voor controle.`);
      }
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
        const itemQuantity = Number(item.quantity || 1);
        const itemUnitPrice = Number.parseFloat(item.price || 0);
        const itemTotal = (itemUnitPrice * itemQuantity).toFixed(2);
        const lineObj = {
          product_id: pid,
          quantity: itemQuantity,
          // WooCommerce expects both subtotal and total when the POS overrides
          // the catalog price. Open-bedrag items deliberately use the cashier's
          // entered amount instead of the product's WooCommerce price.
          subtotal: itemTotal,
          total: itemTotal
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
      if (process.env.BDMPOS_CORE_URL && process.env.BDMPOS_CORE_SECRET) {
        // Use the same stable request ID on every retry. Core can replay a
        // completed request rather than creating a duplicate WooCommerce order.
        const result = await callBdmposWooApi({
          method: 'POST',
          path: '/orders',
          data: orderData,
          requestId: clientOrderId
        });
        responseOrder = result.data;
      } else {
        const fetchRes = await fetchWithTimeout(url + '/wp-json/wc/v3/orders', {
          method: 'POST',
          headers: customHeaders,
          body: JSON.stringify(orderData)
        }, 60000);
        const responseText = await fetchRes.text();
        if (!fetchRes.ok) throw new Error('HTTP ' + fetchRes.status + ': ' + responseText);
        responseOrder = JSON.parse(responseText);
      }
    } catch (fetchErr) {
      // Never issue a second WooCommerce POST after an uncertain timeout.
      // The original request may have reached WooCommerce successfully.
      // On the queue path the same request id is the duplicate guard, so do
      // not spend another worker cycle searching before telling the till to retry.
      const existingAfterError = (useBdmposCore && queueTransport)
        ? null
        : await findExistingWooOrder(url, authHeader, clientOrderId);
      if (existingAfterError?.id) {
        responseOrder = existingAfterError;
      } else {
        const timedOut = fetchErr?.name === 'AbortError' || /aborted|abort|Timeout|nog niet verwerkt|niet bereikbaar|ECONN|ETIMEDOUT/i.test(String(fetchErr?.message || ''));
        const message = timedOut
          ? 'WooCommerce reageerde te laat tijdens het aanmaken van de bestelling. De bestelling is niet bevestigd; de POS kan veilig opnieuw proberen.'
          : `WooCommerce checkout niet bevestigd: ${fetchErr.message}`;
        const timeoutError = new Error(message);
        if (timedOut) timeoutError.code = 'WOO_CHECKOUT_TIMEOUT';
        throw timeoutError;
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
    const message = error.message || 'Checkout mislukt.';
    const retryable = error.code === 'WOO_CHECKOUT_TIMEOUT' || /Timeout|nog niet verwerkt|niet bereikbaar|ECONN|ETIMEDOUT|aborted|al verwerkt/i.test(message);
    console.error('[CHECKOUT API ERROR]:', error?.name || 'Error', message, error?.stack || '');
    return res.status(retryable ? 503 : 500).json({ success: false, retryable, error: message });
  }
}