import { fetchBdmposCustomerPoints, transactBdmposCustomerPoints } from './bdmpos-core';

function parsePointsValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') raw = raw.balance ?? raw.points ?? raw.value ?? raw.amount;
  const points = Number.parseInt(String(raw), 10);
  return Number.isFinite(points) ? points : null;
}

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

/** POS earning rule: 1 point per full euro, plus 1 point when cents are 51-99. */
export function calculateEarnedPoints(totalPaid) {
  const amount = typeof totalPaid === 'string' ? totalPaid.replace(',', '.') : totalPaid;
  const euros = Number.parseFloat(amount);
  if (!Number.isFinite(euros) || euros <= 0) return 0;
  const wholeEuros = Math.floor(euros);
  const centsRemainder = Math.round((euros - wholeEuros) * 100);
  return wholeEuros + (centsRemainder >= 51 ? 1 : 0);
}

export async function getCustomerPoints(customerId) {
  const numericCustomerId = Number(customerId);
  if (!Number.isInteger(numericCustomerId) || numericCustomerId <= 0) return 0;
  return fetchBdmposCustomerPoints(numericCustomerId);
}

export async function getCustomersPoints(customerIds) {
  const ids = [...new Set((Array.isArray(customerIds) ? customerIds : []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
  const result = {};
  for (let index = 0; index < ids.length; index += 10) {
    const batch = ids.slice(index, index + 10);
    const balances = await Promise.all(batch.map(async id => [String(id), await fetchBdmposCustomerPoints(id)]));
    for (const [id, points] of balances) result[id] = points;
  }
  return result;
}

/** Ensure the completed POS order has exactly the POS-calculated earned points. */
export async function syncEarnedCustomerPoints({ customerId, pointsEarned = 0, orderId }) {
  const numericCustomerId = Number(customerId);
  const earned = Math.max(0, Number.parseInt(pointsEarned, 10) || 0);
  const numericOrderId = Number(orderId);
  if (!numericCustomerId || Number.isNaN(numericCustomerId)) return { updated: false, pointsBalance: 0, reason: 'non-numeric-customer' };
  if (!numericOrderId || Number.isNaN(numericOrderId)) throw new Error('WooCommerce order-ID ontbreekt voor puntenbijschrijving.');
  if (!earned) return { updated: false, pointsBalance: await getCustomerPoints(numericCustomerId), earned: 0, reason: 'no-points-earned' };
  return transactBdmposCustomerPoints({ customerId: numericCustomerId, action: 'sync_earned', points: earned, orderId: numericOrderId, requestId: `points-earned-order-${numericOrderId}` });
}

export async function redeemCustomerPoints({ customerId, pointsUsed = 0, orderId }) {
  const numericCustomerId = Number(customerId);
  const used = Math.max(0, Number.parseInt(pointsUsed, 10) || 0);
  const numericOrderId = Number(orderId);
  if (!numericCustomerId || Number.isNaN(numericCustomerId)) return { updated: false, pointsBalance: 0, reason: 'non-numeric-customer' };
  if (!used) return { updated: false, pointsBalance: await getCustomerPoints(numericCustomerId), reason: 'no-points-used' };
  if (!numericOrderId || Number.isNaN(numericOrderId)) throw new Error('WooCommerce order-ID ontbreekt voor punteninwisseling.');
  return transactBdmposCustomerPoints({ customerId: numericCustomerId, action: 'redeem', points: used, orderId: numericOrderId, requestId: `points-redeem-order-${numericOrderId}` });
}

export async function updateCustomerPoints({ customerId, pointsUsed = 0, orderId }) {
  if (pointsUsed > 0) return redeemCustomerPoints({ customerId, pointsUsed, orderId });
  return { updated: false, pointsBalance: await getCustomerPoints(customerId), earned: 0, reason: 'earning-managed-by-checkout' };
}
