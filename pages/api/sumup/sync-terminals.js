import db from '../../../lib/db';

export default async function handler(req, res) {
  try {
    const backendUrl = 'http://localhost:3001/api/terminal/readers';
    const response = await fetch(backendUrl);
    const data = await response.json();

    if (response.ok && data.success) {
      const activeReaderIds = (data.readers || []).map(r => r.id);
      
      const [stores] = await db.query('SELECT id, terminal_id FROM stores WHERE terminal_id IS NOT NULL');
      
      let unlinkedCount = 0;
      for (const store of stores) {
        if (!activeReaderIds.includes(store.terminal_id)) {
          await db.query('UPDATE stores SET terminal_id = NULL WHERE id = ?', [store.id]);
          unlinkedCount++;
        }
      }

      return res.status(200).json({ success: true, message: `Sync voltooid. ${unlinkedCount} ontkoppelde terminals opgeschoond.` });
    }

    return res.status(500).json({ success: false, error: 'Kon geen readers ophalen van de microservice.' });
  } catch (error) {
    console.error('Terminal Sync Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}