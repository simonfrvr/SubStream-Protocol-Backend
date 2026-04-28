import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { auditMiddleware } from '../utils/audit';
import { enhancedMerchantService } from '../services/enhancedMerchantService';
import { rbacAuth, AuthenticatedMemberRequest } from '../middleware/rbacAuth';
import { logger } from '../utils/logger';
import { body, param, query, validationResult } from 'express-validator';

const router = Router();

// Validation middleware
const handleValidationErrors = (req: AuthenticatedMemberRequest, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid request parameters',
      details: errors.array(),
      timestamp: new Date().toISOString()
    });
  }
  next();
};

// POST /api/v1/merchants - Create new merchant
router.post('/',
  rbacAuth.authenticateMember,
  rbacAuth.requirePermission('merchants:write'),
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
    body('baseCurrency').isIn(['USD', 'EUR', 'GBP']).withMessage('Invalid base currency'),
    body('ownerMemberId').optional().isUUID().withMessage('Invalid owner member ID')
  ],
  handleValidationErrors,
  auditMiddleware('create_merchant', 'data_modification'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { name, baseCurrency, ownerMemberId } = req.body;
    const member = req.member!;

    try {
      const merchantId = await enhancedMerchantService.createMerchant({
        name,
        baseCurrency,
        organizationId: member.organizationId,
        ownerMemberId: ownerMemberId || member.id,
        tenantId: member.organizationId
      }, member.id);

      const merchant = await enhancedMerchantService.getMerchantById(merchantId, member.organizationId);

      res.status(201).json({
        success: true,
        data: merchant,
        timestamp: new Date().toISOString(),
        message: 'Merchant created successfully'
      });
    } catch (error) {
      logger.error('Error creating merchant', { error, member: member.id });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create merchant',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// GET /api/v1/merchants - Get merchants for current organization
router.get('/',
  rbacAuth.authenticateMember,
  rbacAuth.requirePermission('merchants:read'),
  [
    query('organizationId').optional().isUUID().withMessage('Invalid organization ID')
  ],
  handleValidationErrors,
  auditMiddleware('get_merchants', 'data_access'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const member = req.member!;
    const { organizationId } = req.query;

    try {
      // Use member's organization if not specified
      const targetOrganizationId = (organizationId as string) || member.organizationId;

      // Verify member has access to the requested organization
      if (targetOrganizationId !== member.organizationId && !member.permissions.includes('cross:org:access')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Access denied to organization',
          timestamp: new Date().toISOString()
        });
      }

      const merchants = await enhancedMerchantService.getMerchantsByOrganization(targetOrganizationId);

      res.json({
        success: true,
        data: merchants,
        timestamp: new Date().toISOString(),
        message: 'Merchants retrieved successfully'
      });
    } catch (error) {
      logger.error('Error fetching merchants', { error, member: member.id });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve merchants',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// GET /api/v1/merchants/:id - Get merchant by ID with tenant isolation
router.get('/:id',
  rbacAuth.authenticateMember,
  rbacAuth.requirePermission('merchants:read'),
  [
    param('id').isUUID().withMessage('Invalid merchant ID')
  ],
  handleValidationErrors,
  auditMiddleware('get_merchant', 'data_access'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { id } = req.params;
    const member = req.member!;

    try {
      const merchant = await enhancedMerchantService.getMerchantById(id, member.organizationId);
      
      if (!merchant) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Merchant not found or access denied',
          timestamp: new Date().toISOString()
        });
      }

      // Verify merchant belongs to member's organization (or member has cross-org access)
      if (merchant.organizationId !== member.organizationId && !member.permissions.includes('cross:org:access')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Access denied to merchant',
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        data: merchant,
        timestamp: new Date().toISOString(),
        message: 'Merchant retrieved successfully'
      });
    } catch (error) {
      logger.error('Error fetching merchant', { id, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve merchant',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// PUT /api/v1/merchants/:id - Update merchant
router.put('/:id',
  rbacAuth.authenticateMember,
  rbacAuth.requirePermission('merchants:write'),
  [
    param('id').isUUID().withMessage('Invalid merchant ID'),
    body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
    body('baseCurrency').optional().isIn(['USD', 'EUR', 'GBP']).withMessage('Invalid base currency'),
    body('ownerMemberId').optional().isUUID().withMessage('Invalid owner member ID')
  ],
  handleValidationErrors,
  auditMiddleware('update_merchant', 'data_modification'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { id } = req.params;
    const { name, baseCurrency, ownerMemberId } = req.body;
    const member = req.member!;

    try {
      // Verify merchant exists and is accessible
      const existingMerchant = await enhancedMerchantService.getMerchantById(id, member.organizationId);
      
      if (!existingMerchant) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Merchant not found or access denied',
          timestamp: new Date().toISOString()
        });
      }

      // Verify merchant belongs to member's organization (or member has cross-org access)
      if (existingMerchant.organizationId !== member.organizationId && !member.permissions.includes('cross:org:access')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Access denied to merchant',
          timestamp: new Date().toISOString()
        });
      }

      await enhancedMerchantService.updateMerchant(id, {
        name,
        baseCurrency,
        ownerMemberId
      }, member.organizationId);

      const updatedMerchant = await enhancedMerchantService.getMerchantById(id, member.organizationId);

      res.json({
        success: true,
        data: updatedMerchant,
        timestamp: new Date().toISOString(),
        message: 'Merchant updated successfully'
      });
    } catch (error) {
      logger.error('Error updating merchant', { id, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update merchant',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// DELETE /api/v1/merchants/:id - Delete merchant
router.delete('/:id',
  rbacAuth.authenticateMember,
  rbacAuth.requirePermission('merchants:delete'),
  [
    param('id').isUUID().withMessage('Invalid merchant ID')
  ],
  handleValidationErrors,
  auditMiddleware('delete_merchant', 'data_modification'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { id } = req.params;
    const member = req.member!;

    try {
      // Verify merchant exists and is accessible
      const existingMerchant = await enhancedMerchantService.getMerchantById(id, member.organizationId);
      
      if (!existingMerchant) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Merchant not found or access denied',
          timestamp: new Date().toISOString()
        });
      }

      // Verify merchant belongs to member's organization (or member has cross-org access)
      if (existingMerchant.organizationId !== member.organizationId && !member.permissions.includes('cross:org:access')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Access denied to merchant',
          timestamp: new Date().toISOString()
        });
      }

      await enhancedMerchantService.deleteMerchant(id, member.organizationId);

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        message: 'Merchant deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting merchant', { id, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete merchant',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// GET /api/v1/merchants/:id/balances - Get merchant balances
router.get('/:id/balances',
  rbacAuth.authenticateMember,
  rbacAuth.requirePermission('treasury:read'),
  [
    param('id').isUUID().withMessage('Invalid merchant ID')
  ],
  handleValidationErrors,
  auditMiddleware('get_merchant_balances', 'data_access'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { id } = req.params;
    const member = req.member!;

    try {
      // Verify merchant exists and is accessible
      const merchant = await enhancedMerchantService.getMerchantById(id, member.organizationId);
      
      if (!merchant) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Merchant not found or access denied',
          timestamp: new Date().toISOString()
        });
      }

      // Verify merchant belongs to member's organization (or member has cross-org access)
      if (merchant.organizationId !== member.organizationId && !member.permissions.includes('cross:org:access')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Access denied to merchant',
          timestamp: new Date().toISOString()
        });
      }

      const balances = await enhancedMerchantService.getMerchantBalances(id, member.organizationId);

      res.json({
        success: true,
        data: balances,
        timestamp: new Date().toISOString(),
        message: 'Merchant balances retrieved successfully'
      });
    } catch (error) {
      logger.error('Error fetching merchant balances', { id, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve merchant balances',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// Transfer merchant to different organization (ADMIN only)
router.post('/:id/transfer',
  rbacAuth.authenticateMember,
  rbacAuth.requirePermission('org:write'),
  [
    param('id').isUUID().withMessage('Invalid merchant ID'),
    body('targetOrganizationId').isUUID().withMessage('Invalid target organization ID'),
    body('targetTenantId').isString().withMessage('Invalid target tenant ID')
  ],
  handleValidationErrors,
  auditMiddleware('transfer_merchant', 'data_modification'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { id } = req.params;
    const { targetOrganizationId, targetTenantId } = req.body;
    const member = req.member!;

    try {
      // Verify merchant exists and is accessible
      const existingMerchant = await enhancedMerchantService.getMerchantById(id, member.organizationId);
      
      if (!existingMerchant) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Merchant not found or access denied',
          timestamp: new Date().toISOString()
        });
      }

      // Verify merchant belongs to member's organization
      if (existingMerchant.organizationId !== member.organizationId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Can only transfer merchants from your own organization',
          timestamp: new Date().toISOString()
        });
      }

      await enhancedMerchantService.transferMerchant(
        id, 
        targetOrganizationId, 
        targetTenantId, 
        member.organizationId
      );

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        message: 'Merchant transferred successfully'
      });
    } catch (error) {
      logger.error('Error transferring merchant', { id, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to transfer merchant',
        timestamp: new Date().toISOString()
      });
    }
  })
);

export { router as enhancedMerchantRoutes };
