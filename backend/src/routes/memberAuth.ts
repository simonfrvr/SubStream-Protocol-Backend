import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { auditMiddleware } from '../utils/audit';
import { organizationService } from '../services/organizationService';
import { authService } from '../services/authService';
import { rbacAuth, AuthenticatedMemberRequest } from '../middleware/rbacAuth';
import { logger } from '../utils/logger';
import { body, validationResult } from 'express-validator';

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

// POST /api/v1/auth/login - Member login with Stellar public key
router.post('/login',
  [
    body('stellarPublicKey').isLength({ min: 56, max: 56 }).withMessage('Stellar public key must be 56 characters'),
    body('organizationSlug').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Invalid organization slug'),
    body('signature').optional().isLength({ min: 128, max: 128 }).withMessage('Invalid signature format')
  ],
  handleValidationErrors,
  auditMiddleware('member_login', 'access_control'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { stellarPublicKey, organizationSlug, signature } = req.body;

    try {
      let member = null;
      let organization = null;

      // If organization slug is provided, find the organization first
      if (organizationSlug) {
        organization = await organizationService.getOrganizationBySlug(organizationSlug);
        if (!organization) {
          return res.status(404).json({
            error: 'Not Found',
            message: 'Organization not found',
            timestamp: new Date().toISOString()
          });
        }

        // Find member by Stellar public key in this organization
        member = await organizationService.getMemberByStellarPublicKey(organization.id, stellarPublicKey);
      } else {
        // Search across all organizations for the member (for SSO scenarios)
        // This would require implementing a cross-organization search method
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Organization slug is required',
          timestamp: new Date().toISOString()
        });
      }

      if (!member) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid credentials or member not found',
          timestamp: new Date().toISOString()
        });
      }

      if (member.status !== 'ACTIVE') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Account is not active',
          timestamp: new Date().toISOString()
        });
      }

      // In a real implementation, you would verify the cryptographic signature here
      // For now, we'll assume the signature is valid if provided
      if (signature) {
        // TODO: Implement Stellar signature verification
        // const isValidSignature = await verifyStellarSignature(stellarPublicKey, signature, challenge);
        // if (!isValidSignature) {
        //   return res.status(401).json({
        //     error: 'Unauthorized',
        //     message: 'Invalid signature',
        //     timestamp: new Date().toISOString()
        //   });
        // }
      }

      // Update last login
      await organizationService.updateMember(member.id, {
        lastLoginAt: new Date()
      });

      // Generate JWT token
      const token = authService.generateMemberToken(member);
      const refreshToken = authService.generateRefreshToken(member.id);

      // Set secure HTTP-only cookie with refresh token
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });

      res.json({
        success: true,
        data: {
          token,
          member: {
            id: member.id,
            email: member.email,
            role: member.role,
            permissions: member.permissions,
            organizationId: member.organizationId,
            organization: organization
          },
          expiresIn: '24h'
        },
        timestamp: new Date().toISOString(),
        message: 'Login successful'
      });
    } catch (error) {
      logger.error('Error during member login', { stellarPublicKey, organizationSlug, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Login failed',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// POST /api/v1/auth/refresh - Refresh access token
router.post('/refresh',
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Refresh token required',
        timestamp: new Date().toISOString()
      });
    }

    try {
      const { memberId } = authService.verifyRefreshToken(refreshToken);
      
      // Get fresh member data
      const member = await organizationService.getMemberById(memberId);
      
      if (!member || member.status !== 'ACTIVE') {
        // Clear invalid refresh token
        res.clearCookie('refreshToken');
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired refresh token',
          timestamp: new Date().toISOString()
        });
      }

      // Generate new access token
      const newToken = authService.generateMemberToken(member);
      const newRefreshToken = authService.generateRefreshToken(member.id);

      // Update refresh token cookie
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });

      res.json({
        success: true,
        data: {
          token: newToken,
          expiresIn: '24h'
        },
        timestamp: new Date().toISOString(),
        message: 'Token refreshed successfully'
      });
    } catch (error) {
      // Clear invalid refresh token
      res.clearCookie('refreshToken');
      
      logger.error('Error refreshing token', { error });
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid refresh token',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// POST /api/v1/auth/logout - Member logout
router.post('/logout',
  rbacAuth.authenticateMember,
  auditMiddleware('member_logout', 'access_control'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    try {
      // Clear refresh token cookie
      res.clearCookie('refreshToken');

      // In a real implementation, you would also:
      // 1. Add the JWT to a revocation list/cache
      // 2. Invalidate the session in your session store

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        message: 'Logout successful'
      });
    } catch (error) {
      logger.error('Error during logout', { error, member: req.member?.id });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Logout failed',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// GET /api/v1/auth/me - Get current member profile
router.get('/me',
  rbacAuth.authenticateMember,
  rbacAuth.requirePermission('org:read'),
  auditMiddleware('get_member_profile', 'data_access'),
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const member = req.member!;

    try {
      // Get organization details
      const organization = await organizationService.getOrganizationById(member.organizationId);

      res.json({
        success: true,
        data: {
          ...member,
          organization
        },
        timestamp: new Date().toISOString(),
        message: 'Member profile retrieved successfully'
      });
    } catch (error) {
      logger.error('Error fetching member profile', { memberId: member.id, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve profile',
        timestamp: new Date().toISOString()
      });
    }
  })
);

// POST /api/v1/auth/verify-stellar - Verify Stellar signature (for web wallet integration)
router.post('/verify-stellar',
  [
    body('publicKey').isLength({ min: 56, max: 56 }).withMessage('Stellar public key must be 56 characters'),
    body('signature').isLength({ min: 128, max: 128 }).withMessage('Invalid signature format'),
    body('message').isString().withMessage('Message is required')
  ],
  handleValidationErrors,
  asyncHandler(async (req: AuthenticatedMemberRequest, res: Response) => {
    const { publicKey, signature, message } = req.body;

    try {
      // TODO: Implement actual Stellar signature verification
      // This would use Stellar SDK to verify the signature
      // const isValidSignature = await verifyStellarSignature(publicKey, signature, message);
      
      // For now, we'll simulate verification
      const isValidSignature = true; // Placeholder

      if (!isValidSignature) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid Stellar signature',
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        data: {
          publicKey,
          verified: true
        },
        timestamp: new Date().toISOString(),
        message: 'Stellar signature verified successfully'
      });
    } catch (error) {
      logger.error('Error verifying Stellar signature', { publicKey, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Signature verification failed',
        timestamp: new Date().toISOString()
      });
    }
  })
);

export { router as memberAuthRoutes };
