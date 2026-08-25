import axios from 'axios';

/**
 * Start a SumUp payment through the external Bendemen SumUp gateway.
 * No SumUp credential is ever sent to the browser or stored on the POS VPS.
 */
export async function processDirectSumupCheckout(totalAmount, terminalId, _accessToken, foreignTransactionId) {
  try {
    const gatewayUrl = process.env.SUMUP_GATEWAY_URL || 'https://pos-sumup.vercel.app';
    const gatewaySecret = process.env.SUMUP_GATEWAY_SECRET;

    if (!gatewaySecret) {
      return { success: false, error: 'SUMUP_GATEWAY_SECRET ontbreekt op de POS-server.' };
    }

    const response = await axios.post(
      `${gatewayUrl.replace(/\/$/, '')}/api/pay`,
      {
        amount: Number(totalAmount),
        readerId: terminalId,
        description: 'Bendemen POS betaling',
        foreignTransactionId: foreignTransactionId || `bdm-${Date.now()}`,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-SumUp-Gateway-Secret': gatewaySecret,
        },
        timeout: 15000,
      }
    );

    return { success: true, data: response.data };
  } catch (error) {
    console.error('SumUp Gateway Fout:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error || 'SumUp gateway reageerde niet.',
    };
  }
}
