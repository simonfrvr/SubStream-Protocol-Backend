import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { auditMiddleware } from '../utils/audit';
import { organizationService } from '../services/organizationService';
import { rbacAuth, AuthenticatedMemberRequest } from '../middleware/rbacAuth';
import { logger } from '../utils/logger';
import { body, param, validationResult } from 'express-validator';
import { sendInvitationEmail } from '../services/emailService';

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

// POST /api/v1/organizations/:id/invitations - Create invitation
router.post('/:id/invitations',
  rbacAuth.authenticateMember,
  rbacAuth.requireTenantAccess(req => req.params.id),
  rbacAuth.requirePermission('members:invite'),
  [
    param('id').isUUID().withMessage('Invalid organization ID'),
    body('email').isEmail().withMessage('Valid email required'),
    body('role').isIn(['ADMIN', 'VIEWER', 'BILLING_MANAGER']).withMessage('Invalid role'),
    body('message').optional().trim().isLength({ max: 500 }).withMessage('Message must be less than 500 characters'),
    body('expiresInDays').optional().isInt({ min: 1, max: 30 }).withMessage('Expires in days must be between 1 and 30')
  ],
  handleValidationErrors,
  auditMiddleware('create_invitation', 'access_control'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { id: organizationId } = req.params;
    const { email, role, message, expiresInDays } = req.body;
    const member = req.member!;

    try {
      // Check if member already exists in organization
      const existingMember = await organizationService.getMemberByEmail(organizationId, email);
      if (existingMember) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'User is already a member of this organization',
          timestamp: new Date().toISOString()
        });
      }

      // Check for existing pending invitation
      const pendingInvitations = await organizationService.getPendingInvitations(organizationId);
      const existingInvitation = pendingInvitations.find(inv => inv.email === email);
      
      if (existingInvitation) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Invitation already sent to this email',
          timestamp: new Date().toISOString()
        });
      }

      const invitationId = await organizationService.createInvitation({
        organizationId,
        invitedBy: member.id,
        email,
        role,
        message,
        expiresInDays
      });

      const invitation = await organizationService.getInvitationByToken(
        (await organizationService.getPendingInvitations(organizationId))
          .find(inv => inv.id === invitationId)?.token || ''
      );

      // Send invitation email
      try {
        await sendInvitationEmail({
          to: email,
          organizationName: (await organizationService.getOrganizationById(organizationId))?.name || '',
          inviterName: member.email,
          role,
          token: invitation?.token || '',
          message
        });
      } catch (emailError) {
        logger.error('Failed to send invitation email', { emailError, invitationId });
        // Don't fail the request if email fails, but log it
      }

      res.status(201).json({
        success: true,
        data: {
          id: invitationId,
          email,
          role,
          status: 'PENDING',
          message: 'Invitation sent successfully'
        },
        timestamp: new Date().toISOString(),
        message: 'Invitation created and sent successfully'
      });
    } catch (error) {
      logger.error('Error creating invitation', { organizationId, email, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create invitation',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// GET /api/v1/organizations/:id/invitations - Get pending invitations
router.get('/:id/invitations',
  rbacAuth.authenticateMember,
  rbacAuth.requireTenantAccess(req => req.params.id),
  rbacAuth.requirePermission('members:read'),
  [
    param('id').isUUID().withMessage('Invalid organization ID')
  ],
  handleValidationErrors,
  auditMiddleware('get_invitations', 'access_control'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { id: organizationId } = req.params;

    try {
      const invitations = await organizationService.getPendingInvitations(organizationId);

      res.json({
        success: true,
        data: invitations,
        timestamp: new Date().toISOString(),
        message: 'Pending invitations retrieved successfully'
      });
    } catch (error) {
      logger.error('Error fetching invitations', { organizationId, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve invitations',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// POST /api/v1/invitations/:token/accept - Accept invitation
router.post('/invitations/:token/accept',
  [
    param('token').isLength({ min: 32 }).withMessage('Invalid invitation token'),
    body('stellarPublicKey').isLength({ min: 56, max: 56 }).withMessage('Stellar public key must be 56 characters')
  ],
  handleValidationErrors,
  auditMiddleware('accept_invitation', 'access_control'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { token } = req.params;
    const { stellarPublicKey } = req.body;

    try {
      const invitation = await organizationService.getInvitationByToken(token);
      
      if (!invitation) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Invitation not found or expired',
          timestamp: new Date().toISOString()
        });
      }

      if (invitation.status !== 'PENDING') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invitation has already been processed',
          timestamp: new Date().toISOString()
        });
      }

      // Check if member already exists with this Stellar public key
      const existingMemberWithKey = await organizationService.getMemberByStellarPublicKey(
        invitation.organizationId, 
        stellarPublicKey
      );
      
      if (existingMemberWithKey) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Stellar public key is already registered in this organization',
          timestamp: new Date().toISOString()
        });
      }

      // Create the member
      const memberId = await organizationService.createMember({
        organizationId: invitation.organizationId,
        email: invitation.email,
        stellarPublicKey,
        role: invitation.role,
        status: 'ACTIVE',
        invitedBy: invitation.invitedBy
      });

      // Mark invitation as accepted
      await organizationService.updateInvitationStatus(invitation.id, 'ACCEPTED');

      const member = await organizationService.getMemberById(memberId);

      res.status(201).json({
        success: true,
        data: member,
        timestamp: new Date().toISOString(),
        message: 'Invitation accepted successfully'
      });
    } catch (error) {
      logger.error('Error accepting invitation', { token, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to accept invitation',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// POST /api/v1/invitations/:token/cancel - Cancel invitation (ADMIN only)
router.post('/invitations/:token/cancel',
  rbacAuth.authenticateMember,
  [
    param('token').isLength({ min: 32 }).withMessage('Invalid invitation token')
  ],
  handleValidationErrors,
  auditMiddleware('cancel_invitation', 'access_control'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { token } = req.params;
    const member = req.member!;

    try {
      const invitation = await organizationService.getInvitationByToken(token);
      
      if (!invitation) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Invitation not found or expired',
          timestamp: new Date().toISOString()
        });
      }

      // Verify the member is from the same organization and has admin permissions
      if (member.organizationId !== invitation.organizationId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only cancel invitations for your own organization',
          timestamp: new Date().toISOString()
        });
      }

      if (!member.permissions.includes('members:delete')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions to cancel invitations',
          timestamp: new Date().toISOString()
        });
      }

      if (invitation.status !== 'PENDING') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invitation has already been processed',
          timestamp: new Date().toISOString()
        });
      }

      await organizationService.updateInvitationStatus(invitation.id, 'CANCELLED');

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        message: 'Invitation cancelled successfully'
      });
    } catch (error) {
      logger.error('Error cancelling invitation', { token, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to cancel invitation',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// GET /api/v1/invitations/:token - Get invitation details (public endpoint for email links)
router.get('/invitations/:token',
  [
    param('token').isLength({ min: 32 }).withMessage('Invalid invitation token')
  ],
  handleValidationErrors,
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { token } = req.params;

    try {
      const invitation = await organizationService.getInvitationByToken(token);
      
      if (!invitation) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Invitation not found or expired',
          timestamp: new Date().toISOString()
        });
      }

      const organization = await organizationService.getOrganizationById(invitation.organizationId);

      // Return limited public information
      res.json({
        success: true,
        data: {
          email: invitation.email,
          role: invitation.role,
          organizationName: organization?.name,
          message: invitation.message,
          expiresAt: invitation.expiresAt
        },
        timestamp: new Date().toISOString(),
        message: 'Invitation details retrieved successfully'
      });
    } catch (error) {
      logger.error('Error fetching invitation details', { token, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve invitation details',
        timestamp: new Date().toISOString()
      });
    }
  })
);

export { router as invitationRoutes };
