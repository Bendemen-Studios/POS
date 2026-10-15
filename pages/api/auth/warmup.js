import db from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false });
  }

  // Keep warmup deliberately cheap: establish/reuse a DB connection without
  // running migrations or returning any database data to the client.
  try {
    await db.query('SELECT 1');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(204).end();
  } catch (error) {
    // Warmup is best-effort; normal login handles and reports real failures.
    return res.status(503).json({ success: false });
  }
}
