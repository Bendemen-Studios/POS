const DEFAULT_WOO_URL = 'https://www.bendemen.com';

function getWooConfig() {
  const url = process.env.WOO_SITE_URL || process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || DEFAULT_WOO_URL;
  const consumerKey = process.env.WOO_CONSUMER_KEY || process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
  const consumerSecret = process.env.WOO_CONSUMER_SECRET || process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;
  if (!consumerKey || !consumerSecret) throw new Error('WooCommerce API sleutels zijn niet geconfigureerd.');
  return { url: url.replace(/\/$/, ''), consumerKey, consumerSecret };
}

function parsePointsValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') raw = raw.balance ?? raw.points ?? raw.value ?? raw.amount;
  const points = Number.parseInt(String(raw), 10);
  return Number.isFinite(points) ? points : null;
}

/**
 * Fallback parser for cached/WooCommerce customer objects.
 * The authoritative balance is fetched from Points & Rewards through the bridge.
 */
export function extractCustomerPoints(customer) {
  if (!customer || typeof customer !== 'object') return 0;

  const direct = [customer.points_balance, customer.pointsBalance, customer.points];
  for (const value of direct) {
    const parsed = parsePointsValue(value);
    if (parsed !== null) return Math.max(0, parsed);
  }

  if (Array.isArray(customer.meta_data)) {
    const keys = new Set(['wc_points_balance', '_wc_points_balance', 'points_balance', '_points_balance']);
    for (const meta of customer.meta_data) {
      if (!meta || !keys.has(String(meta.key || ''))) continue;
      const parsed = parsePointsValue(meta.value);
      if (parsed !== null) return Math.max(0, parsed);
    }
  }

  return 0;
}

function buildHeaders(consumerKey, consumerSecret) {
  return {
    Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`,
    'Content-Type': 'application/json',
    'User-Agent': 'BDM-POS-Server/1.0',
  };
}

async function fetchPointsBridge({ method = 'GET', customerId, customerIds, action, points, orderId }) {
  const { url, consumerKey, consumerSecret } = getWooConfig();
  const endpoint = `${url}/wp-json/wc/v3/bdm-points`;
  const query = new URLSearchParams();

  if (Array.isArray(customerIds) && customerIds.length) {
    query.set('customer_ids', customerIds.map((id) => String(Number(id))).filter(Boolean).join(','));
  } else if (customerId) {
    query.set('customer_id', String(customerId));
  }

  const options = {
    method,
    headers: buildHeaders(consumerKey, consumerSecret),
    cache: 'no-store',
  };

  if (method !== 'GET') {
    options.body = JSON.stringify({
      action,
      customer_id: Number(customerId),
      points: Number(points || 0),
      order_id: orderId ? Number(orderId) : 0,
    });
  }

  const response = await fetch(`${endpoint}${query.toString() ? `?${query}` : ''}`, options);
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}
  if (!response.ok) throw new Error(data?.message || `WooCommerce Points API HTTP ${response.status}`);
  return data;
}

/** Preview only. Actual earning is handled by WooCommerce Points & Rewards. */
export function calculateEarnedPoints(totalPaid) {
  const amount = typeof totalPaid === 'string' ? totalPaid.replace(',', '.') : totalPaid;
  const euros = Number.parseFloat(amount);
  if (!Number.isFinite(euros) || euros <= 0) return 0;
  const wholeEuros = Math.floor(euros);
  const centsRemainder = Math.round((euros - wholeEuros) * 100);
  return wholeEuros + (centsRemainder > 50 ? 1 : 0);
}

export async function getCustomerPoints(customerId) {
  const numericCustomerId = Number(customerId);
  if (!numericCustomerId || Number.isNaN(numericCustomerId)) return 0;

  const data = await fetchPointsBridge({ method: 'GET', customerId: numericCustomerId });
  const points = parsePointsValue(data?.pointsBalance);
  return points !== null ? Math.max(0, points) : 0;
}

/** Fetch authoritative Points & Rewards balances for several customers in one request. */
export async function getCustomersPoints(customerIds) {
  const ids = [...new Set((Array.isArray(customerIds) ? customerIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0))];

  if (!ids.length) return {};

  const data = await fetchPointsBridge({ method: 'GET', customerIds: ids });
  const balances = data?.balances && typeof data.balances === 'object' ? data.balances : {};
  const result = {};

  for (const id of ids) {
    const points = parsePointsValue(balances[String(id)] ?? balances[id]);
    result[String(id)] = points !== null ? Math.max(0, points) : 0;
  }

  return result;
}

/** Redeem through WooCommerce Points & Rewards, with order-level idempotency. */
export async function redeemCustomerPoints({ customerId, pointsUsed = 0, orderId }) {
  const numericCustomerId = Number(customerId);
  const used = Math.max(0, Number.parseInt(pointsUsed, 10) || 0);
  const numericOrderId = Number(orderId);

  if (!numericCustomerId || Number.isNaN(numericCustomerId)) {
    return { updated: false, pointsBalance: 0, reason: 'non-numeric-customer' };
  }
  if (!used) {
    return { updated: false, pointsBalance: await getCustomerPoints(numericCustomerId), reason: 'no-points-used' };
  }
  if (!numericOrderId || Number.isNaN(numericOrderId)) {
    throw new Error('WooCommerce order-ID ontbreekt voor punteninwisseling.');
  }

  return fetchPointsBridge({
    method: 'POST',
    customerId: numericCustomerId,
    action: 'redeem',
    points: used,
    orderId: numericOrderId,
  });
}

export async function updateCustomerPoints({ customerId, pointsUsed = 0, orderId }) {
  if (pointsUsed > 0) return redeemCustomerPoints({ customerId, pointsUsed, orderId });

  return {
    updated: false,
    pointsBalance: await getCustomerPoints(customerId),
    earned: 0,
    reason: 'earning-managed-by-woocommerce-points-rewards',
  };
}
