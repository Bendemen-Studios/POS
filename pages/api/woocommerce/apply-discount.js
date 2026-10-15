export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
  }

  const { cartItems, discountType = 'none', discountValue = 0, couponCode } = req.body || {};
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ success: false, message: 'De winkelwagen bevat geen geldige artikelen.' });
  }

  // This endpoint does not currently validate coupons against WooCommerce.
  // Never claim a coupon was applied when it has not actually been checked.
  if (typeof couponCode === 'string' && couponCode.trim()) {
    return res.status(400).json({ success: false, message: 'Kortingscodes worden nog niet gevalideerd. Gebruik een percentage- of vaste korting.' });
  }

  const items = [];
  for (const item of cartItems) {
    const price = Number.parseFloat(item?.price);
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, message: 'Een of meer winkelwagenartikelen hebben een ongeldige prijs of hoeveelheid.' });
    }
    items.push({ price, quantity });
  }

  const subtotal = Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100;
  let discountAmount = 0;
  const parsedDiscount = Number.parseFloat(discountValue);

  if (discountType === 'percentage') {
    if (!Number.isFinite(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
      return res.status(400).json({ success: false, message: 'Het kortingspercentage moet tussen 0 en 100 liggen.' });
    }
    discountAmount = subtotal * parsedDiscount / 100;
  } else if (discountType === 'fixed') {
    if (!Number.isFinite(parsedDiscount) || parsedDiscount < 0) {
      return res.status(400).json({ success: false, message: 'De vaste korting moet een geldig positief bedrag zijn.' });
    }
    discountAmount = parsedDiscount;
  } else if (discountType !== 'none') {
    return res.status(400).json({ success: false, message: 'Onbekend kortingstype.' });
  }

  discountAmount = Math.round(Math.min(subtotal, Math.max(0, discountAmount)) * 100) / 100;
  const total = Math.round((subtotal - discountAmount) * 100) / 100;

  return res.status(200).json({
    success: true,
    subtotal,
    discountAmount,
    total,
    appliedCoupons: [],
    feeLines: discountAmount > 0 ? [{
      name: `Korting (${discountType === 'percentage' ? parsedDiscount + '%' : '€' + discountAmount.toFixed(2)})`,
      total: (-discountAmount).toFixed(2),
      tax_class: '',
      tax_status: 'none'
    }] : []
  });
}
