import { rbacAuth, AuthenticatedMemberRequest } from '../middleware/rbacAuth';
import { MemberRole } from '../models/organization';
import jwt from 'jsonwebtoken';
import { Response, NextFunction } from 'express';

// Mock dependencies
jest.mock('../services/organizationService');
jest.mock('../utils/logger');

describe('RBACAuthMiddleware', () => {
  let mockReq: Partial<AuthenticatedMemberRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {
        authorization: 'Bearer valid-token'
      },
      traceId: 'test-trace-id'
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    
    mockNext = jest.fn();
  });

  describe('Authentication', () => {
    test('should authenticate valid JWT token', async () => {
      // Mock valid JWT payload
      const validPayload = {
        sub: 'member-id',
        email: 'test@example.com',
        organizationId: 'org-id',
        role: 'ADMIN' as MemberRole,
        permissions: ['org:read', 'org:write'],
        tenantId: 'org-id',
        sessionId: 'session-id',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: 'jwt-id',
        iss: 'stellar-privacy',
        aud: 'stellar-api'
      };

      // Mock jwt.verify
      jest.spyOn(jwt, 'verify').mockReturnValue(validPayload);

      // Mock organization service
      const { organizationService } = require('../services/organizationService');
      (organizationService.getMemberById as jest.Mock).mockResolvedValue({
        id: 'member-id',
        organizationId: 'org-id',
        role: 'ADMIN',
        status: 'ACTIVE',
        permissions: ['org:read', 'org:write']
      });

      await rbacAuth.authenticateMember(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.member).toBeDefined();
      expect(mockReq.organizationId).toBe('org-id');
      expect(mockReq.tenantId).toBe('org-id');
    });

    test('should reject missing authorization header', async () => {
      mockReq.headers = {};

      await rbacAuth.authenticateMember(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'UNAUTHORIZED',
            message: 'Bearer token required'
          })
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should reject invalid JWT token', async () => {
      mockReq.headers = { authorization: 'Bearer invalid-token' };

      jest.spyOn(jwt, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await rbacAuth.authenticateMember(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should reject inactive member', async () => {
      const validPayload = {
        sub: 'member-id',
        email: 'test@example.com',
        organizationId: 'org-id',
        role: 'ADMIN' as MemberRole,
        permissions: ['org:read'],
        tenantId: 'org-id',
        sessionId: 'session-id',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: 'jwt-id',
        iss: 'stellar-privacy',
        aud: 'stellar-api'
      };

      jest.spyOn(jwt, 'verify').mockReturnValue(validPayload);

      const { organizationService } = require('../services/organizationService');
      (organizationService.getMemberById as jest.Mock).mockResolvedValue({
        id: 'member-id',
        status: 'INACTIVE', // Inactive member
        permissions: ['org:read']
      });

      await rbacAuth.authenticateMember(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Permission Checks', () => {
    beforeEach(() => {
      mockReq.member = {
        id: 'member-id',
        organizationId: 'org-id',
        email: 'test@example.com',
        role: 'ADMIN' as MemberRole,
        status: 'ACTIVE',
        permissions: ['org:read', 'org:write', 'members:invite'],
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });

    test('should allow access with correct permission', async () => {
      const requirePermission = rbacAuth.requirePermission('org:write');
      
      await requirePermission(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should deny access without correct permission', async () => {
      const requirePermission = rbacAuth.requirePermission('org:delete');
      
      await requirePermission(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'FORBIDDEN',
            message: 'Insufficient permissions'
          })
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should allow access with any of multiple permissions', async () => {
      const requireAnyPermission = rbacAuth.requireAnyPermission(['org:delete', 'org:write']);
      
      await requireAnyPermission(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should deny access without any of required permissions', async () => {
      const requireAnyPermission = rbacAuth.requireAnyPermission(['org:delete', 'users:admin']);
      
      await requireAnyPermission(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should allow access with minimum role level', async () => {
      const requireMinimumRole = rbacAuth.requireMinimumRole('VIEWER');
      
      await requireMinimumRole(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should deny access below minimum role level', async () => {
      mockReq.member!.role = 'VIEWER' as MemberRole;
      const requireMinimumRole = rbacAuth.requireMinimumRole('ADMIN');
      
      await requireMinimumRole(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should allow tenant access for correct tenant', async () => {
      mockReq.tenantId = 'org-id';
      const requireTenantAccess = rbacAuth.requireTenantAccess('org-id');
      
      await requireTenantAccess(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should deny tenant access for wrong tenant', async () => {
      mockReq.tenantId = 'different-org-id';
      const requireTenantAccess = rbacAuth.requireTenantAccess('org-id');
      
      await requireTenantAccess(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle missing member in permission check', async () => {
      const requirePermission = rbacAuth.requirePermission('org:read');
      
      await requirePermission(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should handle malformed authorization header', async () => {
      mockReq.headers = { authorization: 'InvalidFormat token' };

      await rbacAuth.authenticateMember(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('JWT Validation', () => {
    test('should validate required JWT claims', async () => {
      const invalidPayload = {
        // Missing required claims
        sub: 'member-id',
        email: 'test@example.com'
      };

      jest.spyOn(jwt, 'verify').mockReturnValue(invalidPayload);

      await rbacAuth.authenticateMember(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should validate email format', async () => {
      const invalidPayload = {
        sub: 'member-id',
        email: 'invalid-email', // Invalid email format
        organizationId: 'org-id',
        role: 'ADMIN' as MemberRole,
        permissions: ['org:read'],
        tenantId: 'org-id',
        sessionId: 'session-id',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: 'jwt-id',
        iss: 'stellar-privacy',
        aud: 'stellar-api'
      };

      jest.spyOn(jwt, 'verify').mockReturnValue(invalidPayload);

      await rbacAuth.authenticateMember(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should validate role', async () => {
      const invalidPayload = {
        sub: 'member-id',
        email: 'test@example.com',
        organizationId: 'org-id',
        role: 'INVALID_ROLE', // Invalid role
        permissions: ['org:read'],
        tenantId: 'org-id',
        sessionId: 'session-id',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: 'jwt-id',
        iss: 'stellar-privacy',
        aud: 'stellar-api'
      };

      jest.spyOn(jwt, 'verify').mockReturnValue(invalidPayload);

      await rbacAuth.authenticateMember(mockReq as AuthenticatedMemberRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
