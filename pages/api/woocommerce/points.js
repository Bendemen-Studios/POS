export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
  }

  try {
    const { customerId, orderTotal, pointsToRedeem, action } = req.body;

    // Controleer of er een klant gekoppeld is
    if (!customerId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Punten sparen en inwisselen is alleen mogelijk als er een klant aan de bestelling is gekoppeld.' 
      });
    }

    // Actie 1: Punten berekenen die verdiend worden bij deze bestelling (1 punt per 1 euro)
    if (action === 'calculate_earned') {
      const pointsEarned = Math.floor(parseFloat(orderTotal) || 0);
      return res.status(200).json({ success: true, pointsEarned });
    }

    // Actie 2: Punten inwisselen (100 punten = €5,00 -> 1 punt = €0,05 korting, al vanaf 1 punt)
    if (action === 'redeem') {
      const redeemPoints = parseInt(pointsToRedeem) || 0;
      
      if (redeemPoints <= 0) {
        return res.status(400).json({ success: false, message: 'Voer minimaal 1 punt in om in te wisselen.' });
      }

      // Bereken de korting: 100 punten = 5 euro, dus 1 punt = 0.05 euro
      const discountValue = redeemPoints * 0.05;

      return res.status(200).json({
        success: true,
        pointsRedeemed: redeemPoints,
        discountAmount: discountValue.toFixed(2),
        feeLines: [{
          name: `Punteninwisseling (${redeemPoints} punten)`,
          total: (-discountValue).toFixed(2)
        }]
      });
    }

    return res.status(400).json({ success: false, message: 'Onbekende actie opgegeven.' });

  } catch (error) {
    console.error("Points API Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}