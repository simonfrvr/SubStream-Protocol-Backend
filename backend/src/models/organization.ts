export type MemberRole = 'ADMIN' | 'VIEWER' | 'BILLING_MANAGER';
export type MemberStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  description?: string;
  createdBy: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Member {
  id: string;
  organizationId: string;
  email: string;
  stellarPublicKey?: string;
  role: MemberRole;
  status: MemberStatus;
  invitedBy?: string;
  invitedAt?: Date;
  joinedAt?: Date;
  lastLoginAt?: Date;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Invitation {
  id: string;
  organizationId: string;
  invitedBy: string;
  email: string;
  role: MemberRole;
  token: string;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt?: Date;
  message?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMember {
  member: Member;
  organization: Organization;
}

export interface MemberWithPermissions extends Member {
  permissions: string[];
}

// Role-based permissions mapping
export const ROLE_PERMISSIONS: Record<MemberRole, string[]> = {
  ADMIN: [
    'org:read',
    'org:write',
    'org:delete',
    'members:read',
    'members:write',
    'members:delete',
    'members:invite',
    'merchants:read',
    'merchants:write',
    'merchants:delete',
    'billing:read',
    'billing:write',
    'billing:delete',
    'analytics:read',
    'treasury:read',
    'treasury:write'
  ],
  VIEWER: [
    'org:read',
    'members:read',
    'merchants:read',
    'billing:read',
    'analytics:read',
    'treasury:read'
  ],
  BILLING_MANAGER: [
    'org:read',
    'members:read',
    'merchants:read',
    'billing:read',
    'billing:write',
    'analytics:read',
    'treasury:read'
  ]
};

// Helper function to get permissions for a role
export function getPermissionsForRole(role: MemberRole): string[] {
  return ROLE_PERMISSIONS[role] || [];
}

// Helper function to check if a role has a specific permission
export function hasPermission(role: MemberRole, permission: string): boolean {
  return getPermissionsForRole(role).includes(permission);
}

// Enhanced Merchant interface with organization support
export interface EnhancedMerchant extends Merchant {
  organizationId?: string;
  ownerMemberId?: string;
  tenantId: string;
}

// Import existing Merchant interface
import { Merchant } from './merchant';
