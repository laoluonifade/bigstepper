import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface PaystackResponse<T> { status: boolean; message: string; data: T }

@Injectable()
export class PaystackClient {
  private readonly baseUrl = 'https://api.paystack.co';
  constructor(private readonly config: ConfigService) {}

  initialize(input: { email: string; amount: number; currency: string; reference: string; metadata: string; callback_url: string }) {
    return this.request<{ authorization_url: string; access_code: string; reference: string }>('/transaction/initialize', { method: 'POST', body: JSON.stringify(input) });
  }

  verifyTransaction(reference: string) {
    return this.request<{ id: number; status: string; reference: string; amount: number; currency: string }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  }

  createRefund(input: { transaction: string; amount: number; currency: string; customer_note?: string; merchant_note?: string }) {
    return this.request<{ id: number; status: string; transaction: { reference: string } }>('/refund', { method: 'POST', body: JSON.stringify(input) });
  }

  createRecipient(input: { type: 'nuban'; name: string; account_number: string; bank_code: string; currency: 'NGN' }) {
    return this.request<{ recipient_code: string; details: { account_name: string; account_number: string; bank_code: string } }>('/transferrecipient', { method: 'POST', body: JSON.stringify(input) });
  }

  initiateTransfer(input: { source: 'balance'; amount: number; recipient: string; reference: string; reason: string }) {
    return this.request<{ transfer_code: string; reference: string; status: string }>('/transfer', { method: 'POST', body: JSON.stringify(input) });
  }

  verifyTransfer(reference: string) {
    return this.request<{ transfer_code: string; reference: string; status: string; amount: number; currency: string }>(`/transfer/verify/${encodeURIComponent(reference)}`);
  }

  /** Nigerian banks that can receive NGN transfers (https://paystack.com/docs/api/miscellaneous/#bank). */
  listBanks() {
    return this.request<Array<{ name: string; code: string; active: boolean; is_deleted: boolean | null; type: string }>>(
      '/bank?country=nigeria&currency=NGN&perPage=100',
    );
  }

  /** The account holder's name for a NUBAN, as the bank has it (https://paystack.com/docs/identity-verification/verify-account-number/). */
  resolveAccount(accountNumber: string, bankCode: string) {
    return this.request<{ account_number: string; account_name: string }>(
      `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    );
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const secret = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...init.headers },
      });
    } catch {
      throw new BadGatewayException('Payment provider is unavailable');
    }
    const payload = (await response.json().catch(() => null)) as PaystackResponse<T> | null;
    if (!response.ok || !payload?.status) {
      throw new BadGatewayException(payload?.message || 'Payment provider rejected the request');
    }
    return payload.data;
  }
}
