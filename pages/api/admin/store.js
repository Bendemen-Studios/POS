import db from '../../../lib/db';

export default async function handler(req, res) {
  const { method } = req;

  // Lightweight probe used by the POS to determine whether the VPS itself
  // is reachable. It deliberately does not touch MySQL or WooCommerce.
  if (method === 'GET' && (Object.prototype.hasOwnProperty.call(req.query, 'healthcheck') || Object.prototype.hasOwnProperty.call(req.query, '_pos_health'))) {
    return res.status(200).json({ success: true, online: true, timestamp: Date.now() });
  }

  if (method === 'GET') {
    try {
      const [rows] = await db.query('SELECT * FROM stores');
      const formattedStores = (Array.isArray(rows) ? rows : []).map((s) => {
        let pm = s.payment_methods;
        if (typeof pm === 'string') {
          try { pm = JSON.parse(pm); } catch (e) { pm = { sumup: true, manual_pin: true, cash: true }; }
        }
        return {
          ...s,
          id: s.id,
          store_id: s.id,
          store_name: s.store_name || 'Onbekend Filiaal',
          kvk: s.kvk || '',
          btw: s.btw || '',
          terminal_id: s.terminal_id || null,
          payment_methods: pm || { sumup: true, manual_pin: true, cash: true }
        };
      });
      return res.status(200).json({ success: true, stores: formattedStores });
    } catch (error) {
      console.error('Fout bij ophalen winkels:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (method === 'POST') {
    const { store_name, address, receipt_header, receipt_footer, pickup_id, terminal_id, kvk, btw, payment_methods } = req.body;
    if (!store_name || !store_name.trim()) return res.status(400).json({ success: false, error: 'De filiaalnaam (store_name) is verplicht.' });
    try {
      const customId = `store_${Date.now()}`;
      const paymentMethodsJson = JSON.stringify(payment_methods || { sumup: true, manual_pin: true, cash: true });
      await db.query('INSERT INTO stores (id, store_name, address, receipt_header, receipt_footer, pickup_id, terminal_id, kvk, btw, payment_methods) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [customId, store_name.trim(), address || null, receipt_header || null, receipt_footer || null, pickup_id || null, terminal_id || null, kvk || null, btw || null, paymentMethodsJson]);
      return res.status(200).json({ success: true, id: customId });
    } catch (error) {
      console.error('Fout bij toevoegen winkel:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (method === 'PUT') {
    const { id, store_id, store_name, address, receipt_header, receipt_footer, pickup_id, terminal_id, kvk, btw, payment_methods } = req.body;
    const targetId = id || store_id;
    if (!store_name || !store_name.trim()) return res.status(400).json({ success: false, error: 'De filiaalnaam (store_name) is verplicht.' });
    try {
      const paymentMethodsJson = JSON.stringify(payment_methods || { sumup: true, manual_pin: true, cash: true });
      const cleanTerminalId = terminal_id && terminal_id !== '' && terminal_id !== 'null' ? terminal_id : null;
      await db.query('UPDATE stores SET store_name = ?, address = ?, receipt_header = ?, receipt_footer = ?, pickup_id = ?, terminal_id = ?, kvk = ?, btw = ?, payment_methods = ? WHERE id = ?', [store_name.trim(), address || null, receipt_header || null, receipt_footer || null, pickup_id || null, cleanTerminalId, kvk || null, btw || null, paymentMethodsJson, targetId]);
      return res.status(200).json({ success: true, message: 'Filiaal bijgewerkt' });
    } catch (error) {
      console.error('Fout bij bijwerken winkel:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (method === 'DELETE') {
    const { id } = req.query;
    try {
      const [rowsTotal] = await db.query('SELECT COUNT(*) AS total FROM stores');
      const totalStores = rowsTotal[0]?.total || 0;
      if (totalStores <= 1) return res.status(400).json({ success: false, error: 'Er moet minimaal 1 actief filiaal in het systeem aanwezig blijven.' });
      await db.query('DELETE FROM stores WHERE id = ?', [id]);
      await db.query('UPDATE users SET store_id = NULL WHERE store_id = ?', [id]);
      return res.status(200).json({ success: true, message: 'Filiaal succesvol verwijderd' });
    } catch (error) {
      console.error('Fout bij verwijderen winkel:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  return res.status(405).end(`Method ${method} Not Allowed`);
}
