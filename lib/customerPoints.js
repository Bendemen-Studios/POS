const DEFAULT_WOO_URL = 'https://www.bendemen.com';

function getWooConfig() {
  const url = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || DEFAULT_WOO_URL;
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;
  if (!consumerKey || !consumerSecret) throw new Error('WooCommerce API sleutels zijn niet geconfigureerd.');
  return { url: url.replace(/\/$/, ''), consumerKey, consumerSecret };
}

function parsePointsValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') raw = raw.balance ?? raw.points ?? raw.value ?? raw.amount;
  const points = Number.parseInt(String(raw), 10);
  return Number.isFinite(points) && points >= 0 ? points : null;
}

function getPointsMeta(customer) {
  const meta = Array.isArray(customer?.meta_data) ? customer.meta_data : [];
  const keys = ['wc_points_balance', '_wc_points_balance', 'points_balance', 'points', 'wc_points'];
  const candidates = [];
  for (const key of keys) {
    for (const entry of meta.filter((item) => String(item?.key || '') === key)) {
      const points = parsePointsValue(entry?.value);
      if (points !== null) candidates.push({ key, points });
    }
  }
  for (const raw of [customer?.points_balance, customer?.points, customer?.wc_points_balance]) {
    const points = parsePointsValue(raw);
    if (points !== null) candidates.push({ key: 'fallback', points });
  }
  return candidates.length ? Math.max(...candidates.map((candidate) => candidate.points)) : 0;
}

export function calculateEarnedPoints(totalPaid) {
  const amount = typeof totalPaid === 'string' ? totalPaid.replace(',', '.') : totalPaid;
  const euros = Number.parseFloat(amount);
  if (!Number.isFinite(euros) || euros <= 0) return 0;

  // 1 point per €1. A fractional euro only earns the next point once it is
  // strictly above €0.50. Thus €1.50 = 1 point, €1.51 = 2 points.
  const wholeEuros = Math.floor(euros);
  const centsRemainder = Math.round((euros - wholeEuros) * 100);
  return wholeEuros + (centsRemainder > 50 ? 1 : 0);
}

function buildHeaders(consumerKey, consumerSecret) {
  return {
    Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`,
    'Content-Type': 'application/json',
    'User-Agent': 'BDM-POS-Server/1.0',
  };
}

async function fetchCustomer(customerId) {
  const { url, consumerKey, consumerSecret } = getWooConfig();
  const response = await fetch(`${url}/wp-json/wc/v3/customers/${encodeURIComponent(customerId)}`, {
    method: 'GET',
    headers: buildHeaders(consumerKey, consumerSecret),
    cache: 'no-store',
  });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}
  if (!response.ok) throw new Error(data?.message || `WooCommerce HTTP ${response.status}`);
  return data;
}

export function extractCustomerPoints(customer) {
  return getPointsMeta(customer);
}

export async function getCustomerPoints(customerId) {
  if (!customerId || Number.isNaN(Number(customerId))) return 0;
  return getPointsMeta(await fetchCustomer(Number(customerId)));
}

export async function updateCustomerPoints({ customerId, pointsUsed = 0, totalPaid = 0 }) {
  if (!customerId || Number.isNaN(Number(customerId))) {
    return { updated: false, pointsBalance: 0, reason: 'non-numeric-customer' };
  }

  const numericCustomerId = Number(customerId);
  const used = Math.max(0, Number.parseInt(pointsUsed, 10) || 0);
  const earned = calculateEarnedPoints(totalPaid);
  const { url, consumerKey, consumerSecret } = getWooConfig();
  const customer = await fetchCustomer(numericCustomerId);
  const currentPoints = getPointsMeta(customer);
  const newBalance = Math.max(0, currentPoints - used) + earned;

  const metaData = Array.isArray(customer.meta_data) ? [...customer.meta_data] : [];
  const existingIndex = metaData.findIndex((item) => String(item?.key || '') === 'wc_points_balance');
  const pointsMeta = { key: 'wc_points_balance', value: String(newBalance) };
  if (existingIndex >= 0) metaData[existingIndex] = pointsMeta;
  else metaData.push(pointsMeta);

  const response = await fetch(`${url}/wp-json/wc/v3/customers/${numericCustomerId}`, {
    method: 'PUT',
    headers: buildHeaders(consumerKey, consumerSecret),
    body: JSON.stringify({ meta_data: metaData }),
  });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}
  if (!response.ok) throw new Error(data?.message || `WooCommerce HTTP ${response.status}`);
  return { updated: true, pointsBalance: newBalance, customer: data };
}
