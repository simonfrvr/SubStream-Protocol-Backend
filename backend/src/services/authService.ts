import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { MemberWithPermissions, MemberJWTPayload } from '../models/organization';
import { v4 as uuidv4 } from 'uuid';

export class AuthService {
  private privateKey: string;
  private issuer: string;
  private audience: string;
  private tokenExpiration: string;

  constructor() {
    this.privateKey = process.env.STELLAR_PRIVATE_KEY || '';
    this.issuer = process.env.JWT_ISSUER || 'stellar-privacy';
    this.audience = process.env.JWT_AUDIENCE || 'stellar-api';
    this.tokenExpiration = process.env.JWT_EXPIRATION || '24h';
  }

  /**
   * Generate JWT token for authenticated member
   */
  generateMemberToken(member: MemberWithPermissions): string {
    try {
      const payload: MemberJWTPayload = {
        sub: member.id,
        email: member.email,
        organizationId: member.organizationId,
        role: member.role,
        permissions: member.permissions,
        tenantId: member.organizationId, // Use organization ID as tenant ID
        sessionId: uuidv4(),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + this.parseExpiration(this.tokenExpiration),
        jti: uuidv4(),
        iss: this.issuer,
        aud: this.audience
      };

      const token = jwt.sign(payload, this.privateKey, {
        algorithm: 'ES256',
        expiresIn: this.tokenExpiration
      });

      logger.info('JWT token generated for member', {
        memberId: member.id,
        organizationId: member.organizationId,
        role: member.role
      });

      return token;
    } catch (error) {
      logger.error('Error generating JWT token', { memberId: member.id, error });
      throw new Error('Failed to generate authentication token');
    }
  }

  /**
   * Verify and decode JWT token
   */
  verifyToken(token: string): MemberJWTPayload {
    try {
      const decoded = jwt.verify(token, this.privateKey, {
        algorithms: ['ES256'],
        issuer: this.issuer,
        audience: this.audience
      }) as MemberJWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      } else {
        logger.error('Error verifying token', { error });
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Generate refresh token for long-lived sessions
   */
  generateRefreshToken(memberId: string): string {
    try {
      const payload = {
        sub: memberId,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
        jti: uuidv4(),
        iss: this.issuer,
        aud: this.audience
      };

      return jwt.sign(payload, this.privateKey, {
        algorithm: 'ES256'
      });
    } catch (error) {
      logger.error('Error generating refresh token', { memberId, error });
      throw new Error('Failed to generate refresh token');
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): { memberId: string } {
    try {
      const decoded = jwt.verify(token, this.privateKey, {
        algorithms: ['ES256'],
        issuer: this.issuer,
        audience: this.audience
      }) as any;

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      return { memberId: decoded.sub };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      } else {
        logger.error('Error verifying refresh token', { error });
        throw new Error('Refresh token verification failed');
      }
    }
  }

  /**
   * Generate API key for service accounts
   */
  generateApiKey(organizationId: string, permissions: string[]): string {
    try {
      const keyId = uuidv4();
      const timestamp = Date.now().toString(36);
      
      // Create API key in format: stellar_api_v1_<hash>
      const keyData = `${organizationId}:${keyId}:${permissions.join(',')}:${timestamp}`;
      const hash = require('crypto')
        .createHash('sha256')
        .update(keyData)
        .digest('hex')
        .substring(0, 32);

      return `stellar_api_v1_${hash}`;
    } catch (error) {
      logger.error('Error generating API key', { organizationId, error });
      throw new Error('Failed to generate API key');
    }
  }

  /**
   * Parse expiration string to seconds
   */
  private parseExpiration(expiration: string): number {
    const units: Record<string, number> = {
      's': 1,
      'm': 60,
      'h': 3600,
      'd': 86400,
      'w': 604800
    };

    const match = expiration.match(/^(\d+)([smhdw])$/);
    if (!match) {
      throw new Error('Invalid expiration format');
    }

    const [, value, unit] = match;
    return parseInt(value) * (units[unit] || 3600);
  }

  /**
   * Create session token for web login
   */
  createSessionToken(memberId: string, organizationId: string): string {
    try {
      const payload = {
        sub: memberId,
        organizationId,
        type: 'session',
        sessionId: uuidv4(),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
        jti: uuidv4(),
        iss: this.issuer,
        aud: this.audience
      };

      return jwt.sign(payload, this.privateKey, {
        algorithm: 'ES256'
      });
    } catch (error) {
      logger.error('Error creating session token', { memberId, organizationId, error });
      throw new Error('Failed to create session token');
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return null;
      }
      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if token will expire within specified minutes
   */
  isTokenExpiringSoon(token: string, minutesThreshold: number = 15): boolean {
    const expiration = this.getTokenExpiration(token);
    if (!expiration) {
      return true;
    }
    
    const threshold = new Date(Date.now() + minutesThreshold * 60 * 1000);
    return expiration <= threshold;
  }
}

export const authService = new AuthService();
