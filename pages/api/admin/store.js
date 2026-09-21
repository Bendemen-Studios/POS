import db from '../../../lib/db';

const PROTECTED_STORE_ID = 'store_ons_winkeltje';
const PROTECTED_STORE_NAME = 'ons winkeltje';

export default async function handler(req, res) {
  const { method } = req;

  // Real POS health probe. The checkout depends on the VPS, MySQL
  // idempotency table and WooCommerce, so browser connectivity alone is not
  // enough to decide whether an order can be sent directly.
  if (method === 'GET' && (Object.prototype.hasOwnProperty.call(req.query, 'healthcheck') || Object.prototype.hasOwnProperty.call(req.query, '_pos_health'))) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);

    const checkWooCommerce = async () => {
      const url = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || 'https://www.bendemen.com';
      const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
      const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;
      if (!consumerKey || !consumerSecret) return false;
      const auth = 'Basic ' + Buffer.from(consumerKey + ':' + consumerSecret).toString('base64');
      const response = await fetch(url + '/wp-json/wc/v3/orders?per_page=1', {
        method: 'GET',
        headers: {
          Authorization: auth,
          'User-Agent': 'BDM-POS-Health/1.0',
          Connection: 'close'
        },
        signal: controller.signal
      });
      return response.ok;
    };

    try {
      const [dbResult, wooResult] = await Promise.allSettled([
        db.query('SELECT 1 AS ok'),
        checkWooCommerce()
      ]);
      const dbOnline = dbResult.status === 'fulfilled';
      const wooOnline = wooResult.status === 'fulfilled' && wooResult.value === true;
      const online = dbOnline && wooOnline;
      return res.status(200).json({
        success: true,
        online,
        pos: true,
        database: dbOnline,
        woocommerce: wooOnline,
        latencyMs: Date.now() - startedAt,
        timestamp: Date.now()
      });
    } catch (_) {
      return res.status(200).json({
        success: true,
        online: false,
        pos: true,
        database: false,
        woocommerce: false,
        latencyMs: Date.now() - startedAt,
        timestamp: Date.now()
      });
    } finally {
      clearTimeout(timer);
    }
  }

  if (method === 'GET') {
    try {
      // The database is the single source of truth. No default/fallback
      // branch is inserted or invented here.
      const [rows] = await db.query('SELECT * FROM stores ORDER BY store_name ASC');
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
    if (!targetId) return res.status(400).json({ success: false, error: 'Filiaal-ID ontbreekt.' });
    if (!store_name || !store_name.trim()) return res.status(400).json({ success: false, error: 'De filiaalnaam (store_name) is verplicht.' });
    try {
      // The protected branch may be edited, but it can never be renamed away
      // from its protected identity or removed.
      if (String(targetId) === PROTECTED_STORE_ID && store_name.trim().toLowerCase() !== PROTECTED_STORE_NAME) {
        return res.status(403).json({ success: false, error: 'Ons Winkeltje kan niet worden hernoemd.' });
      }

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
      if (!id) return res.status(400).json({ success: false, error: 'Filiaal-ID ontbreekt.' });

      const [rows] = await db.query('SELECT id, store_name FROM stores WHERE id = ? LIMIT 1', [id]);
      const store = Array.isArray(rows) ? rows[0] : null;
      if (!store) return res.status(404).json({ success: false, error: 'Filiaal niet gevonden.' });

      // Ons Winkeltje is a permanent protected branch and may never be deleted,
      // even when other branches exist.
      if (String(store.id) === PROTECTED_STORE_ID || String(store.store_name || '').trim().toLowerCase() === PROTECTED_STORE_NAME) {
        return res.status(403).json({ success: false, error: 'Ons Winkeltje kan niet worden verwijderd.' });
      }

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
