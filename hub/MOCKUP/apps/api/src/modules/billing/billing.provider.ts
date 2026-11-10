/**
 * @file billing.provider.ts
 * @description Interface e adaptador desacoplado para provedores de pagamento (Asaas, Pagar.me, Stripe)
 */

import {
  BillingProvider,
  CreateCustomerDTO,
  CreateSubscriptionDTO,
} from '@mockup/types';

export class GenericBillingProvider implements BillingProvider {
  public async createCustomer(data: CreateCustomerDTO): Promise<{ externalCustomerId: string }> {
    // Adapter genérico extensível para Asaas / Pagar.me / Stripe
    const customerId = `cus_${Date.now()}_${data.cnpj.replace(/\D/g, '').substring(0, 8)}`;
    return { externalCustomerId: customerId };
  }

  public async createSubscription(
    _data: CreateSubscriptionDTO
  ): Promise<{ externalSubscriptionId: string; status: string }> {
    const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      externalSubscriptionId: subId,
      status: 'active',
    };
  }

  public async cancelSubscription(
    _externalSubscriptionId: string
  ): Promise<{ success: boolean; status: string }> {
    return {
      success: true,
      status: 'canceled',
    };
  }

  public async getSubscription(
    _externalSubscriptionId: string
  ): Promise<{ status: string; currentPeriodEnd: string }> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    return {
      status: 'active',
      currentPeriodEnd: futureDate.toISOString(),
    };
  }
}

export const billingProvider: BillingProvider = new GenericBillingProvider();
