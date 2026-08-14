import axios from 'axios';

export async function processDirectSumupCheckout(totalAmount, terminalId, accessToken) {
  try {
    // Stuur de pinaanvraag rechtstreeks van de browser naar de SumUp Cloud API
    const response = await axios.post(
      `https://api.sumup.com/v0.1/terminals/${terminalId}/checkouts`,
      {
        amount: totalAmount,
        currency: 'EUR',
        checkout_reference: `POS-OFFLINE-${Date.now()}`
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    return { success: true, data: response.data };
  } catch (error) {
    console.error('Directe SumUp Fout:', error.response?.data || error.message);
    return { 
      success: false, 
      error: error.response?.data?.message || 'SumUp terminal reageerde niet via directe verbinding.' 
    };
  }
}