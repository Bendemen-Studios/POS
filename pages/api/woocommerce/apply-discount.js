export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
  }

  try {
    const { cartItems, discountType, discountValue, couponCode } = req.body;

    // Bereken subtotaal
    let subtotal = cartItems.reduce((acc, item) => acc + (parseFloat(item.price) * item.quantity), 0);
    let discountAmount = 0;
    let appliedCoupons = [];

    // 1. Verwerk Vouchers / Coupons
    if (couponCode) {
      appliedCoupons.push({ code: couponCode });
      // Je kunt hier eventueel extra WooCommerce coupon validatie toevoegen via API indien gewenst
    }

    // 2. Verwerk Percentage of Vaste Korting
    if (discountType === 'percentage') {
      discountAmount = (subtotal * parseFloat(discountValue)) / 100;
    } else if (discountType === 'fixed') {
      discountAmount = parseFloat(discountValue);
    }

    // Zorg dat korting nooit hoger is dan het subtotaal
    if (discountAmount > subtotal) {
      discountAmount = subtotal;
    }

    const total = subtotal - discountAmount;

    return res.status(200).json({
      success: true,
      subtotal,
      discountAmount,
      total,
      appliedCoupons,
      feeLines: discountAmount > 0 ? [{
        name: `Korting (${discountType === 'percentage' ? discountValue + '%' : '€' + discountValue})`,
        total: (-discountAmount).toFixed(2)
      }] : []
    });

  } catch (error) {
    console.error("Discount Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}