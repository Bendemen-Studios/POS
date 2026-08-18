import db from '../../../lib/db'; // Voeg deze import toe om database queries te kunnen doen[cite: 1]

export default async function handler(req, res) {
  const { action, readerId } = req.query;
  const backendUrl = 'http://localhost:3001/api/terminal';

  try {
    let targetUrl = backendUrl;
    let options = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (action === 'readers') {
      targetUrl = `${backendUrl}/readers`;
      options.method = 'GET';
    } else if (action === 'pair') {
      targetUrl = `${backendUrl}/pair`;
      options.method = 'POST';
      options.body = JSON.stringify(req.body);
    } else if (action === 'unlink' && readerId) {
      targetUrl = `${backendUrl}/unlink/${readerId}`;
      options.method = 'DELETE';
    } else if (action === 'assign-store') {
      targetUrl = `${backendUrl}/assign-store`;
      options.method = 'POST';
      options.body = JSON.stringify(req.body);
    } else if (action === 'pay') {
      targetUrl = `${backendUrl}/pay`;
      options.method = 'POST';
      options.body = JSON.stringify(req.body);
    } else {
      return res.status(400).json({ success: false, error: 'Onbekende actie' });
    }

    const response = await fetch(targetUrl, options);
    const data = await response.json();

    // Als de ontkoppeling bij SumUp succesvol was, zet de terminal_id in de database automatisch op NULL
    if (response.ok && data.success && action === 'unlink' && readerId) {
      try {
        await db.query('UPDATE stores SET terminal_id = NULL WHERE terminal_id = ?', [readerId]);
      } catch (dbErr) {
        console.error('Fout bij automatisch legen terminal_id in database:', dbErr);
      }
    }

    return res.status(response.status).json(data);
  } catch (error) {
    console.error('SumUp Proxy Error:', error);
    return res.status(500).json({ success: false, error: 'Kan geen verbinding maken met de SumUp microservice.' });
  }
}