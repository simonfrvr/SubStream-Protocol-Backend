import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { organizationService } from '../services/organizationService';
import { MemberWithPermissions, MemberRole } from '../models/organization';

export interface AuthenticatedMemberRequest extends Request {
  member?: MemberWithPermissions;
  organizationId?: string;
  tenantId?: string;
  traceId?: string;
}

export interface MemberJWTPayload {
  sub: string; // Member ID
  email: string;
  organizationId: string;
  role: MemberRole;
  permissions: string[];
  tenantId: string;
  sessionId: string;
  iat: number; // Issued at
  exp: number; // Expiration
  jti: string; // JWT ID
  iss: string; // Issuer
  aud: string; // Audience
}

export class RBACAuthMiddleware {
  private stellarPublicKey: string;
  private allowedIssuers: string[];
  private allowedAudiences: string[];
  private clockSkewTolerance: number;

  constructor(config: {
    stellarPublicKey: string;
    allowedIssuers?: string[];
    allowedAudiences?: string[];
    clockSkewTolerance?: number;
  }) {
    this.stellarPublicKey = config.stellarPublicKey;
    this.allowedIssuers = config.allowedIssuers || ['stellar-privacy'];
    this.allowedAudiences = config.allowedAudiences || ['stellar-api'];
    this.clockSkewTolerance = config.clockSkewTolerance || 30;
  }

  /**
   * Main authentication middleware for RBAC system
   */
  authenticateMember = async (req: AuthenticatedMemberRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    const traceId = this.generateTraceId();
    
    req.traceId = traceId;

    try {
      if (!authHeader?.startsWith('Bearer ')) {
        return this.sendAuthError(res, 'UNAUTHORIZED', 'Bearer token required', traceId);
      }

      const token = authHeader.substring(7);
      const member = await this.authenticateMemberJWT(token, traceId);
      
      req.member = member;
      req.organizationId = member.organizationId;
      req.tenantId = member.organizationId; // Use organization ID as tenant ID
      
      logger.info('Member authentication successful', {
        memberId: member.id,
        organizationId: member.organizationId,
        role: member.role,
        traceId
      });
      
      return next();
    } catch (error) {
      logger.error('Member authentication failed', {
        error: error.message,
        traceId,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      return this.sendAuthError(res, 'UNAUTHORIZED', 'Invalid authentication', traceId);
    }
  };

  /**
   * Authenticate member using JWT with Stellar signature verification
   */
  private async authenticateMemberJWT(token: string, traceId: string): Promise<MemberWithPermissions> {
    try {
      // Verify JWT signature and claims
      const decoded = jwt.verify(token, this.stellarPublicKey, {
        algorithms: ['ES256'],
        issuer: this.allowedIssuers,
        audience: this.allowedAudiences,
        clockTolerance: this.clockSkewTolerance
      }) as MemberJWTPayload;

      // Validate required claims
      this.validateMemberJWTPayload(decoded);

      // Check if JWT is revoked
      await this.checkJWTRevocation(decoded.jti);

      // Fetch member from database to ensure they're still active
      const member = await organizationService.getMemberById(decoded.sub);
      
      if (!member) {
        throw new Error('Member not found');
      }

      if (member.status !== 'ACTIVE') {
        throw new Error('Member account is not active');
      }

      // Verify organization and tenant match
      if (member.organizationId !== decoded.organizationId) {
        throw new Error('Organization mismatch');
      }

      // Update last login
      await organizationService.updateMember(member.id, {
        lastLoginAt: new Date()
      });

      return member;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('JWT token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid JWT token');
      } else {
        throw error;
      }
    }
  }

  /**
   * Validate member JWT payload structure
   */
  private validateMemberJWTPayload(payload: MemberJWTPayload): void {
    const requiredFields = ['sub', 'email', 'organizationId', 'role', 'permissions', 'tenantId', 'sessionId', 'iat', 'exp', 'jti', 'iss', 'aud'];
    
    for (const field of requiredFields) {
      if (!(field in payload)) {
        throw new Error(`Missing required JWT claim: ${field}`);
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.email)) {
      throw new Error('Invalid email format in JWT');
    }

    // Validate role
    const validRoles = ['ADMIN', 'VIEWER', 'BILLING_MANAGER'];
    if (!validRoles.includes(payload.role)) {
      throw new Error('Invalid role in JWT');
    }

    // Validate permissions array
    if (!Array.isArray(payload.permissions) || payload.permissions.length === 0) {
      throw new Error('Invalid permissions in JWT');
    }

    // Check expiration
    const maxExpiration = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours max
    if (payload.exp > maxExpiration) {
      throw new Error('JWT expiration too far in the future');
    }
  }

  /**
   * Check if JWT has been revoked
   */
  private async checkJWTRevocation(jti: string): Promise<void> {
    // This would typically check against a Redis cache or database
    // For now, we'll implement a simple in-memory cache check
    const revokedTokens = new Set<string>(); // This should be a persistent cache
    if (revokedTokens.has(jti)) {
      throw new Error('JWT token has been revoked');
    }
  }

  /**
   * Middleware to require specific permission
   */
  requirePermission = (permission: string) => {
    return (req: AuthenticatedMemberRequest, res: Response, next: NextFunction): void => {
      if (!req.member) {
        return this.sendAuthError(res, 'UNAUTHORIZED', 'Authentication required', req.traceId || 'unknown');
      }

      if (!req.member.permissions.includes(permission)) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions',
            details: {
              requiredPermission: permission,
              userPermissions: req.member.permissions,
              memberRole: req.member.role,
              traceId: req.traceId
            }
          },
          traceId: req.traceId
        });
        return;
      }

      next();
    };
  };

  /**
   * Middleware to require any of multiple permissions
   */
  requireAnyPermission = (permissions: string[]) => {
    return (req: AuthenticatedMemberRequest, res: Response, next: NextFunction): void => {
      if (!req.member) {
        return this.sendAuthError(res, 'UNAUTHORIZED', 'Authentication required', req.traceId || 'unknown');
      }

      const hasPermission = permissions.some(permission => req.member!.permissions.includes(permission));
      
      if (!hasPermission) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions',
            details: {
              requiredPermissions: permissions,
              userPermissions: req.member.permissions,
              memberRole: req.member.role,
              traceId: req.traceId
            }
          },
          traceId: req.traceId
        });
        return;
      }

      next();
    };
  };

  /**
   * Middleware to require minimum role level
   */
  requireMinimumRole = (minimumRole: MemberRole) => {
    const roleHierarchy = { VIEWER: 0, BILLING_MANAGER: 1, ADMIN: 2 };
    
    return (req: AuthenticatedMemberRequest, res: Response, next: NextFunction): void => {
      if (!req.member) {
        return this.sendAuthError(res, 'UNAUTHORIZED', 'Authentication required', req.traceId || 'unknown');
      }

      const userRoleLevel = roleHierarchy[req.member.role];
      const requiredRoleLevel = roleHierarchy[minimumRole];

      if (userRoleLevel < requiredRoleLevel) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient role level',
            details: {
              requiredRole: minimumRole,
              userRole: req.member.role,
              traceId: req.traceId
            }
          },
          traceId: req.traceId
        });
        return;
      }

      next();
    };
  };

  /**
   * Middleware to ensure tenant isolation
   */
  requireTenantAccess = (tenantId: string) => {
    return (req: AuthenticatedMemberRequest, res: Response, next: NextFunction): void => {
      if (!req.member) {
        return this.sendAuthError(res, 'UNAUTHORIZED', 'Authentication required', req.traceId || 'unknown');
      }

      // Ensure the member's tenant matches the requested tenant
      if (req.tenantId !== tenantId) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Tenant access denied',
            details: {
              requiredTenantId: tenantId,
              userTenantId: req.tenantId,
              organizationId: req.organizationId,
              traceId: req.traceId
            }
          },
          traceId: req.traceId
        });
        return;
      }

      next();
    };
  };

  /**
   * Generate unique trace ID
   */
  private generateTraceId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `trace_${timestamp}${random}`;
  }

  /**
   * Send standardized authentication error response
   */
  private sendAuthError(res: Response, code: string, message: string, traceId: string): void {
    res.status(401).json({
      error: {
        code,
        message,
        details: {
          timestamp: new Date().toISOString(),
          traceId
        }
      },
      traceId
    });
  }
}

// Factory function to create middleware instance
export function createRBACAuth(config: {
  stellarPublicKey: string;
  allowedIssuers?: string[];
  allowedAudiences?: string[];
  clockSkewTolerance?: number;
}): RBACAuthMiddleware {
  return new RBACAuthMiddleware(config);
}

// Default middleware instance using environment variables
export const rbacAuth = createRBACAuth({
  stellarPublicKey: process.env.STELLAR_PUBLIC_KEY || '',
  allowedIssuers: process.env.STELLAR_ALLOWED_ISSUERS?.split(',') || ['stellar-privacy'],
  allowedAudiences: process.env.STELLAR_ALLOWED_AUDIENCES?.split(',') || ['stellar-api'],
  clockSkewTolerance: parseInt(process.env.STELLAR_CLOCK_SKEW_TOLERANCE || '30')
});

export default rbacAuth;
