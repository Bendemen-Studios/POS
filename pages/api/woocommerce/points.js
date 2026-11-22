import { getCustomerPoints, calculateEarnedPoints } from "../../../lib/customerPoints";
import { requireSession } from '../../../lib/session';
import { fetchBdmposCustomerPoints, mutateBdmposCustomerPoints } from '../../../lib/bdmpos-core';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const action = req.method === 'POST' ? String(req.body?.action || '') : 'balance';
    const customerId = req.method === 'GET' ? req.query.customerId : req.body?.customerId;

    // Preview: 1 point per €1. A fractional euro advances to the next point
    // only when it is strictly above €0.50: €2.50 = 2, €2.51 = 3.
    if (req.method === 'POST' && action === 'calculate_earned') {
      const pointsEarned = calculateEarnedPoints(req.body?.orderTotal);
      return res.status(200).json({ success: true, pointsEarned, pointsPerEuro: 1 });
    }

    if (req.method === 'POST' && ['add', 'remove'].includes(action)) {
      if (!customerId || !/^\d+$/.test(String(customerId))) return res.status(400).json({ success: false, message: 'Een geldig klantnummer is verplicht.' });
      if (!process.env.BDMPOS_CORE_URL || !process.env.BDMPOS_CORE_SECRET) {
        return res.status(503).json({ success: false, message: 'BDM POS Core is vereist voor handmatige puntenmutaties.' });
      }
      const points = Math.max(0, Number.parseInt(req.body?.points, 10) || 0);
      const note = String(req.body?.note || '').trim();
      const requestId = String(req.body?.requestId || '').trim();
      if (points < 1 || !note || !requestId) {
        return res.status(400).json({ success: false, message: 'Klant, aantal punten, reden en requestId zijn verplicht.' });
      }
      const adjustment = await mutateBdmposCustomerPoints({
        customerId,
        action,
        points,
        note,
        requestId
      });
      res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
      return res.status(200).json({
        success: true,
        action,
        pointsChanged: adjustment.points_changed,
        pointsBalance: adjustment.points_balance,
        idempotent: Boolean(adjustment.idempotent),
        requestId: adjustment.request_id
      });
    }

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Koppel eerst een klant voordat je punten kunt gebruiken.'
      });
    }

    const currentPoints = process.env.BDMPOS_CORE_URL && process.env.BDMPOS_CORE_SECRET
      ? await fetchBdmposCustomerPoints(customerId)
      : await getCustomerPoints(customerId);

    res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');

    if (req.method === 'GET' || action === 'balance') {
      return res.status(200).json({ success: true, pointsBalance: currentPoints });
    }

    if (action === 'redeem') {
      const redeemPoints = Math.max(0, Math.min(100, Number.parseInt(req.body?.pointsToRedeem, 10) || 0));
      if (redeemPoints <= 0) {
        return res.status(400).json({ success: false, message: 'Voer minimaal 1 punt in om in te wisselen.' });
      }
      if (redeemPoints > currentPoints) {
        return res.status(400).json({
          success: false,
          message: `Onvoldoende punten. Deze klant heeft ${currentPoints} punten.`,
          pointsBalance: currentPoints,
        });
      }

      const discountValue = redeemPoints * 0.05;
      return res.status(200).json({
        success: true,
        pointsRedeemed: redeemPoints,
        discountAmount: discountValue.toFixed(2),
        pointsBalance: currentPoints - redeemPoints,
        feeLines: [{
          name: `Punteninwisseling (${redeemPoints} punten)`,
          total: (-discountValue).toFixed(2)
        }]
      });
    }

    return res.status(400).json({ success: false, message: 'Onbekende actie opgegeven.' });
  } catch (error) {
    console.error('Points API Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Fout bij puntenverwerking.' });
  }
}
