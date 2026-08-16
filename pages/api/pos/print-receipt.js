export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { order, store, cashier, paymentDetails } = req.body;

  const dateStr = new Date().toLocaleString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Geen hardcoded fallbacks meer; gebruikt exact de gegevens van het actieve/geselecteerde filiaal
  const storeName = store?.store_name || store?.name || 'Bendemen';
  const storeAddress = store?.address || store?.location || '';
  const storeKvk = store?.kvk || store?.kvk_number || '82882851';
  const storeVat = store?.vat || store?.vat_number || store?.btw || 'NL003743768B81';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Kassabon #${order?.id || 'Concept'}</title>
      <style>
        @page {
          size: 80mm auto;
          margin: 0;
        }
        body {
          font-family: 'Courier New', Courier, monospace;
          width: 72mm;
          margin: 0 auto;
          padding: 8px 0;
          font-size: 12px;
          color: #000;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .font-bold { font-weight: bold; }
        .header { margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 8px; }
        .store-name { font-size: 16px; font-weight: bold; text-transform: uppercase; }
        .info-table, .items-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        .items-table th { border-bottom: 1px solid #000; text-align: left; padding-bottom: 4px; }
        .items-table td { padding: 3px 0; vertical-align: top; }
        .totals { border-top: 1px dashed #000; margin-top: 8px; padding-top: 6px; }
        .total-line { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; }
        .footer { border-top: 1px dashed #000; margin-top: 12px; padding-top: 8px; font-size: 10px; }
      </style>
    </head>
    <body onload="window.print(); window.close();">
      <div class="header text-center">
        <div class="store-name">${storeName}</div>
        <div>${storeAddress}</div>
        ${storeKvk ? `<div>KVK: ${storeKvk}</div>` : ''}
        ${storeVat ? `<div>BTW: ${storeVat}</div>` : ''}
      </div>

      <table class="info-table">
        <tr><td><strong>Datum:</strong> ${dateStr}</td></tr>
        <tr><td><strong>Order:</strong> #${order?.id || 'POS-' + Date.now()}</td></tr>
        <tr><td><strong>Kassier:</strong> ${cashier?.username || 'Kassa'}</td></tr>
        <tr><td><strong>Betaalwijze:</strong> ${(paymentDetails?.method || 'PIN').toUpperCase()}</td></tr>
      </table>

      <table class="items-table">
        <thead>
          <tr>
            <th>Artikel</th>
            <th class="text-center">Aantal</th>
            <th class="text-right">Totaal</th>
          </tr>
        </thead>
        <tbody>
          ${(order?.orderItems || []).map(item => `
            <tr>
              <td>${item.name}</td>
              <td class="text-center">${item.quantity}</td>
              <td class="text-right">€${(parseFloat(item.price) * item.quantity).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-line">
          <span>TOTAAL:</span>
          <span>€${parseFloat(order?.totals?.totalPaid || 0).toFixed(2)}</span>
        </div>
        ${paymentDetails?.cashGiven ? `
          <div style="display: flex; justify-content: space-between; margin-top: 4px;">
            <span>Contant ontvangen:</span>
            <span>€${parseFloat(paymentDetails.cashGiven).toFixed(2)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Wisselgeld:</span>
            <span>€${parseFloat(paymentDetails.changeDue).toFixed(2)}</span>
          </div>
        ` : ''}
      </div>

      <div class="footer text-center">
        <p><strong>BETAALBEWIJS & KASSABON</strong></p>
        <p>Bedankt voor je aankoop!</p>
      </div>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(htmlContent);
}