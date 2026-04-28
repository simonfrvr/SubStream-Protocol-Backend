import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { auditMiddleware } from '../utils/audit';
import { organizationService } from '../services/organizationService';
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

// POST /api/v1/organizations - Create new organization
router.post('/',
  rbacAuth.authenticateMember,
  rbacAuth.requirePermission('org:write'),
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
    body('slug').trim().isLength({ min: 2, max: 50 }).matches(/^[a-z0-9-]+$/).withMessage('Slug must contain only lowercase letters, numbers, and hyphens'),
    body('domain').optional().isEmail().withMessage('Domain must be a valid email domain'),
    body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters')
  ],
  handleValidationErrors,
  auditMiddleware('create_organization', 'org_write'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { name, slug, domain, description } = req.body;
    const member = req.member!;

    try {
      // Check if slug is already taken
      const existingOrg = await organizationService.getOrganizationBySlug(slug);
      if (existingOrg) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Organization slug already exists',
          timestamp: new Date().toISOString()
        });
      }

      const organizationId = await organizationService.createOrganization({
        name,
        slug,
        domain,
        description,
        createdBy: member.id
      });

      // Create the creator as an ADMIN member
      await organizationService.createMember({
        organizationId,
        email: member.email,
        stellarPublicKey: member.stellarPublicKey,
        role: 'ADMIN',
        status: 'ACTIVE',
        invitedBy: member.id
      });

      const organization = await organizationService.getOrganizationById(organizationId);

      res.status(201).json({
        success: true,
        data: organization,
        timestamp: new Date().toISOString(),
        message: 'Organization created successfully'
      });
    } catch (error) {
      logger.error('Error creating organization', { error, member: member.id });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create organization',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// GET /api/v1/organizations/:id - Get organization by ID
router.get('/:id',
  rbacAuth.authenticateMember,
  rbacAuth.requireTenantAccess(req => req.params.id),
  rbacAuth.requirePermission('org:read'),
  [
    param('id').isUUID().withMessage('Invalid organization ID')
  ],
  handleValidationErrors,
  auditMiddleware('get_organization', 'org_read'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { id } = req.params;

    try {
      const organization = await organizationService.getOrganizationById(id);
      
      if (!organization) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Organization not found',
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        data: organization,
        timestamp: new Date().toISOString(),
        message: 'Organization retrieved successfully'
      });
    } catch (error) {
      logger.error('Error fetching organization', { id, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve organization',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// PUT /api/v1/organizations/:id - Update organization
router.put('/:id',
  rbacAuth.authenticateMember,
  rbacAuth.requireTenantAccess(req => req.params.id),
  rbacAuth.requirePermission('org:write'),
  [
    param('id').isUUID().withMessage('Invalid organization ID'),
    body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
    body('domain').optional().isEmail().withMessage('Domain must be a valid email domain'),
    body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
    body('active').optional().isBoolean().withMessage('Active must be a boolean')
  ],
  handleValidationErrors,
  auditMiddleware('update_organization', 'org_write'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { id } = req.params;
    const { name, domain, description, active } = req.body;

    try {
      const organization = await organizationService.getOrganizationById(id);
      
      if (!organization) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Organization not found',
          timestamp: new Date().toISOString()
        });
      }

      await organizationService.updateOrganization(id, {
        name,
        domain,
        description,
        active
      });

      const updatedOrganization = await organizationService.getOrganizationById(id);

      res.json({
        success: true,
        data: updatedOrganization,
        timestamp: new Date().toISOString(),
        message: 'Organization updated successfully'
      });
    } catch (error) {
      logger.error('Error updating organization', { id, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update organization',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// GET /api/v1/organizations/:id/members - Get organization members
router.get('/:id/members',
  rbacAuth.authenticateMember,
  rbacAuth.requireTenantAccess(req => req.params.id),
  rbacAuth.requirePermission('members:read'),
  [
    param('id').isUUID().withMessage('Invalid organization ID')
  ],
  handleValidationErrors,
  auditMiddleware('get_organization_members', 'members_read'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { id } = req.params;

    try {
      const members = await organizationService.getOrganizationMembers(id);

      res.json({
        success: true,
        data: members,
        timestamp: new Date().toISOString(),
        message: 'Organization members retrieved successfully'
      });
    } catch (error) {
      logger.error('Error fetching organization members', { id, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve organization members',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// POST /api/v1/organizations/:id/members - Add member to organization
router.post('/:id/members',
  rbacAuth.authenticateMember,
  rbacAuth.requireTenantAccess(req => req.params.id),
  rbacAuth.requirePermission('members:write'),
  [
    param('id').isUUID().withMessage('Invalid organization ID'),
    body('email').isEmail().withMessage('Valid email required'),
    body('role').isIn(['ADMIN', 'VIEWER', 'BILLING_MANAGER']).withMessage('Invalid role'),
    body('stellarPublicKey').optional().isLength({ min: 56, max: 56 }).withMessage('Stellar public key must be 56 characters')
  ],
  handleValidationErrors,
  auditMiddleware('add_organization_member', 'members_write'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { id: organizationId } = req.params;
    const { email, role, stellarPublicKey } = req.body;
    const member = req.member!;

    try {
      // Check if member already exists
      const existingMember = await organizationService.getMemberByEmail(organizationId, email);
      if (existingMember) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Member already exists in organization',
          timestamp: new Date().toISOString()
        });
      }

      const memberId = await organizationService.createMember({
        organizationId,
        email,
        stellarPublicKey,
        role,
        status: stellarPublicKey ? 'ACTIVE' : 'PENDING',
        invitedBy: member.id
      });

      const newMember = await organizationService.getMemberById(memberId);

      res.status(201).json({
        success: true,
        data: newMember,
        timestamp: new Date().toISOString(),
        message: 'Member added successfully'
      });
    } catch (error) {
      logger.error('Error adding member to organization', { organizationId, email, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to add member to organization',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// PUT /api/v1/organizations/:id/members/:memberId - Update member
router.put('/:id/members/:memberId',
  rbacAuth.authenticateMember,
  rbacAuth.requireTenantAccess(req => req.params.id),
  rbacAuth.requirePermission('members:write'),
  [
    param('id').isUUID().withMessage('Invalid organization ID'),
    param('memberId').isUUID().withMessage('Invalid member ID'),
    body('role').optional().isIn(['ADMIN', 'VIEWER', 'BILLING_MANAGER']).withMessage('Invalid role'),
    body('status').optional().isIn(['PENDING', 'ACTIVE', 'INACTIVE']).withMessage('Invalid status')
  ],
  handleValidationErrors,
  auditMiddleware('update_organization_member', 'members_write'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { id: organizationId, memberId } = req.params;
    const { role, status } = req.body;

    try {
      const member = await organizationService.getMemberById(memberId);
      
      if (!member || member.organizationId !== organizationId) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Member not found in organization',
          timestamp: new Date().toISOString()
        });
      }

      await organizationService.updateMember(memberId, {
        role,
        status
      });

      const updatedMember = await organizationService.getMemberById(memberId);

      res.json({
        success: true,
        data: updatedMember,
        timestamp: new Date().toISOString(),
        message: 'Member updated successfully'
      });
    } catch (error) {
      logger.error('Error updating member', { organizationId, memberId, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update member',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// DELETE /api/v1/organizations/:id/members/:memberId - Remove member from organization
router.delete('/:id/members/:memberId',
  rbacAuth.authenticateMember,
  rbacAuth.requireTenantAccess(req => req.params.id),
  rbacAuth.requirePermission('members:delete'),
  [
    param('id').isUUID().withMessage('Invalid organization ID'),
    param('memberId').isUUID().withMessage('Invalid member ID')
  ],
  handleValidationErrors,
  auditMiddleware('remove_organization_member', 'members_delete'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { id: organizationId, memberId } = req.params;
    const currentMember = req.member!;

    try {
      const member = await organizationService.getMemberById(memberId);
      
      if (!member || member.organizationId !== organizationId) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Member not found in organization',
          timestamp: new Date().toISOString()
        });
      }

      // Prevent self-removal
      if (memberId === currentMember.id) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Cannot remove yourself from organization',
          timestamp: new Date().toISOString()
        });
      }

      await organizationService.removeMember(memberId);

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        message: 'Member removed successfully'
      });
    } catch (error) {
      logger.error('Error removing member from organization', { organizationId, memberId, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to remove member from organization',
        timestamp: new Date().toISOString()
      });
    }
  })
);

export { router as organizationRoutes };
