import { databaseManager } from '../config/database';
import { logger } from '../utils/logger';
import { Merchant, MerchantBalance, ConsolidatedTreasury } from '../models/merchant';
import { EnhancedMerchant } from '../models/organization';

export class EnhancedMerchantService {
  private db = databaseManager.getConnection();

  async getMerchantById(id: string, tenantId?: string): Promise<EnhancedMerchant | null> {
    try {
      let query = this.db('merchants').where({ id });
      
      // Add tenant isolation if tenantId is provided
      if (tenantId) {
        query = query.andWhere({ tenant_id: tenantId });
      }
      
      const merchant = await query.first();
      
      if (!merchant) {
        logger.warn(`Merchant not found: ${id}${tenantId ? ` in tenant: ${tenantId}` : ''}`);
        return null;
      }

      return {
        id: merchant.id,
        name: merchant.name,
        baseCurrency: merchant.base_currency,
        organizationId: merchant.organization_id,
        ownerMemberId: merchant.owner_member_id,
        tenantId: merchant.tenant_id,
        createdAt: merchant.created_at,
        updatedAt: merchant.updated_at
      };
    } catch (error) {
      logger.error('Error fetching merchant', { id, tenantId, error });
      return null;
    }
  }

  async getMerchantsByOrganization(organizationId: string): Promise<EnhancedMerchant[]> {
    try {
      const merchants = await this.db('merchants')
        .where({ organization_id: organizationId })
        .orderBy('created_at', 'desc');

      return merchants.map((merchant: any) => ({
        id: merchant.id,
        name: merchant.name,
        baseCurrency: merchant.base_currency,
        organizationId: merchant.organization_id,
        ownerMemberId: merchant.owner_member_id,
        tenantId: merchant.tenant_id,
        createdAt: merchant.created_at,
        updatedAt: merchant.updated_at
      }));
    } catch (error) {
      logger.error('Error fetching merchants by organization', { organizationId, error });
      return [];
    }
  }

  async createMerchant(
    merchantData: Omit<EnhancedMerchant, 'id' | 'createdAt' | 'updatedAt'>,
    createdBy: string
  ): Promise<string> {
    try {
      // Use organization ID as tenant ID for multi-tenancy
      const tenantId = merchantData.organizationId || merchantData.tenantId;
      
      const [id] = await this.db('merchants').insert({
        name: merchantData.name,
        base_currency: merchantData.baseCurrency,
        organization_id: merchantData.organizationId,
        owner_member_id: merchantData.ownerMemberId,
        tenant_id: tenantId,
        created_at: new Date(),
        updated_at: new Date()
      }).returning('id');

      logger.info(`Merchant created: ${id} in tenant: ${tenantId} by member: ${createdBy}`);
      return id;
    } catch (error) {
      logger.error('Error creating merchant', { merchantData, createdBy, error });
      throw error;
    }
  }

  async updateMerchant(
    id: string,
    data: Partial<{
      name: string;
      baseCurrency: string;
      ownerMemberId: string;
    }>,
    tenantId: string
  ): Promise<void> {
    try {
      await this.db('merchants')
        .where({ id, tenant_id: tenantId })
        .update({
          ...data,
          base_currency: data.baseCurrency,
          owner_member_id: data.ownerMemberId,
          updated_at: new Date()
        });

      logger.info(`Merchant updated: ${id} in tenant: ${tenantId}`);
    } catch (error) {
      logger.error('Error updating merchant', { id, tenantId, data, error });
      throw error;
    }
  }

  async deleteMerchant(id: string, tenantId: string): Promise<void> {
    try {
      await this.db('merchants')
        .where({ id, tenant_id: tenantId })
        .del();

      logger.info(`Merchant deleted: ${id} in tenant: ${tenantId}`);
    } catch (error) {
      logger.error('Error deleting merchant', { id, tenantId, error });
      throw error;
    }
  }

  async getMerchantBalances(merchantId: string, tenantId: string): Promise<MerchantBalance[]> {
    try {
      const balances = await this.db('merchant_balances')
        .where({ merchant_id: merchantId, tenant_id: tenantId })
        .orderBy('asset_code');

      return balances.map((balance: any) => ({
        id: balance.id,
        merchantId: balance.merchant_id,
        assetCode: balance.asset_code,
        assetIssuer: balance.asset_issuer,
        balance: balance.balance,
        lastUpdated: balance.last_updated
      }));
    } catch (error) {
      logger.error('Error fetching merchant balances', { merchantId, tenantId, error });
      return [];
    }
  }

  async updateMerchantBalance(
    merchantId: string,
    assetCode: string,
    newBalance: string,
    tenantId: string,
    assetIssuer?: string
  ): Promise<void> {
    try {
      await this.db('merchant_balances')
        .insert({
          merchant_id: merchantId,
          asset_code: assetCode,
          asset_issuer: assetIssuer,
          balance: newBalance,
          tenant_id: tenantId,
          last_updated: new Date()
        })
        .onConflict(['merchant_id', 'asset_code', 'tenant_id'])
        .merge({
          balance: newBalance,
          last_updated: new Date()
        });

      logger.info(`Balance updated for merchant ${merchantId}: ${assetCode} = ${newBalance} in tenant: ${tenantId}`);
    } catch (error) {
      logger.error('Error updating merchant balance', { merchantId, assetCode, newBalance, tenantId, error });
      throw error;
    }
  }

  async getHistoricalTreasuryValue(
    merchantId: string,
    tenantId: string,
    hoursAgo: number = 24
  ): Promise<{ timestamp: Date; totalValue: number }[]> {
    try {
      const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
      
      const historicalValues = await this.db('treasury_snapshots')
        .where({ merchant_id: merchantId, tenant_id: tenantId })
        .where('timestamp', '>=', cutoffTime)
        .orderBy('timestamp', 'asc');

      return historicalValues.map((snapshot: any) => ({
        timestamp: snapshot.timestamp,
        totalValue: parseFloat(snapshot.total_value_usd)
      }));
    } catch (error) {
      logger.error('Error fetching historical treasury values', { merchantId, tenantId, hoursAgo, error });
      return [];
    }
  }

  async saveTreasurySnapshot(
    merchantId: string,
    totalValueUsd: string,
    assetBreakdown: any[],
    tenantId: string
  ): Promise<void> {
    try {
      await this.db('treasury_snapshots').insert({
        merchant_id: merchantId,
        total_value_usd: totalValueUsd,
        asset_breakdown: JSON.stringify(assetBreakdown),
        tenant_id: tenantId,
        timestamp: new Date()
      });

      logger.debug(`Treasury snapshot saved for merchant ${merchantId}: $${totalValueUsd} in tenant: ${tenantId}`);
    } catch (error) {
      logger.error('Error saving treasury snapshot', { merchantId, totalValueUsd, tenantId, error });
      // Don't throw error here as this is non-critical
    }
  }

  // Tenant isolation methods
  async getTenantMerchants(tenantId: string): Promise<EnhancedMerchant[]> {
    try {
      const merchants = await this.db('merchants')
        .where({ tenant_id: tenantId })
        .orderBy('created_at', 'desc');

      return merchants.map((merchant: any) => ({
        id: merchant.id,
        name: merchant.name,
        baseCurrency: merchant.base_currency,
        organizationId: merchant.organization_id,
        ownerMemberId: merchant.owner_member_id,
        tenantId: merchant.tenant_id,
        createdAt: merchant.created_at,
        updatedAt: merchant.updated_at
      }));
    } catch (error) {
      logger.error('Error fetching tenant merchants', { tenantId, error });
      return [];
    }
  }

  async verifyTenantAccess(merchantId: string, tenantId: string): Promise<boolean> {
    try {
      const merchant = await this.db('merchants')
        .where({ id: merchantId, tenant_id: tenantId })
        .first();
      
      return !!merchant;
    } catch (error) {
      logger.error('Error verifying tenant access', { merchantId, tenantId, error });
      return false;
    }
  }

  // Transfer merchant to different organization/tenant
  async transferMerchant(
    merchantId: string,
    newOrganizationId: string,
    newTenantId: string,
    currentTenantId: string
  ): Promise<void> {
    try {
      // Verify current tenant access
      const hasAccess = await this.verifyTenantAccess(merchantId, currentTenantId);
      if (!hasAccess) {
        throw new Error('Merchant not found in current tenant');
      }

      // Update merchant
      await this.db('merchants')
        .where({ id: merchantId, tenant_id: currentTenantId })
        .update({
          organization_id: newOrganizationId,
          tenant_id: newTenantId,
          updated_at: new Date()
        });

      // Update related records
      await this.db('merchant_balances')
        .where({ merchant_id: merchantId, tenant_id: currentTenantId })
        .update({
          tenant_id: newTenantId
        });

      await this.db('treasury_snapshots')
        .where({ merchant_id: merchantId, tenant_id: currentTenantId })
        .update({
          tenant_id: newTenantId
        });

      logger.info(`Merchant ${merchantId} transferred from tenant ${currentTenantId} to ${newTenantId}`);
    } catch (error) {
      logger.error('Error transferring merchant', { merchantId, newOrganizationId, newTenantId, currentTenantId, error });
      throw error;
    }
  }
}

export const enhancedMerchantService = new EnhancedMerchantService();
