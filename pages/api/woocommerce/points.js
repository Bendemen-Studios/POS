import { getCustomerPoints } from "../../../lib/customerPoints";

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
  }

  try {
    const customerId = req.method === 'GET' ? req.query.customerId : req.body?.customerId;

    // Een klant is altijd verplicht voor de puntencheck: we moeten
    // de actuele WooCommerce-puntenbalans van die specifieke klant ophalen.
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Koppel eerst een klant voordat je punten kunt gebruiken.'
      });
    }

    const currentPoints = await getCustomerPoints(customerId);

    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        pointsBalance: currentPoints,
      });
    }

    const { orderTotal, pointsToRedeem, action } = req.body || {};

    if (action === 'calculate_earned') {
      const pointsEarned = Math.floor(parseFloat(orderTotal) || 0);
      return res.status(200).json({
        success: true,
        pointsEarned,
        pointsBalance: currentPoints,
      });
    }

    if (action === 'redeem') {
      const redeemPoints = parseInt(pointsToRedeem, 10) || 0;

      if (redeemPoints <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Voer minimaal 1 punt in om in te wisselen.'
        });
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
        pointsBalance: Math.max(0, currentPoints - redeemPoints),
        feeLines: [{
          name: `Punteninwisseling (${redeemPoints} punten)`,
          total: (-discountValue).toFixed(2)
        }]
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Onbekende actie opgegeven.'
    });
  } catch (error) {
    console.error("Points API Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
