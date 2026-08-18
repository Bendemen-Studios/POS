// pages/api/sumup/terminal-manager.js
export default async function handler(req, res) {
  const { action, readerId } = req.query;
  const targetBase = 'http://localhost:3001/api/terminal';

  try {
    let targetUrl = targetBase;
    
    // Map de acties door naar de zelfstandige SumUp add-on microservice op poort 3001
    if (action === 'readers') {
      targetUrl = `${targetBase}/readers`;
    } else if (action === 'pair') {
      targetUrl = `${targetBase}/pair`;
    } else if (action === 'assign-store') {
      targetUrl = `${targetBase}/assign-store`;
    } else if (action === 'unlink') {
      const targetReaderId = readerId || req.query.readerId;
      targetUrl = `${targetBase}/unlink/${targetReaderId}`;
    } else {
      return res.status(404).json({ success: false, error: 'Onbekende SumUp actie' });
    }

    const options = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (['POST', 'PUT'].includes(req.method)) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, options);
    const data = await response.json();

    return res.status(response.status).json(data);
  } catch (err) {
    console.error('Proxy Error naar SumUp microservice (poort 3001):', err);
    return res.status(500).json({ 
      success: false, 
      error: 'Kan geen verbinding maken met de SumUp add-on service op poort 3001.' 
    });
  }
}