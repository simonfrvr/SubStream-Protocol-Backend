import { databaseManager } from '../config/database';
import { logger } from '../utils/logger';
import { 
  Organization, 
  Member, 
  Invitation, 
  MemberRole, 
  MemberStatus, 
  InvitationStatus,
  getPermissionsForRole,
  MemberWithPermissions 
} from '../models/organization';
import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes } from 'crypto';

export class OrganizationService {
  private db = databaseManager.getConnection();

  // Organization Management
  async createOrganization(data: {
    name: string;
    slug: string;
    domain?: string;
    description?: string;
    createdBy: string;
  }): Promise<string> {
    try {
      const [id] = await this.db('organizations').insert({
        name: data.name,
        slug: data.slug,
        domain: data.domain,
        description: data.description,
        created_by: data.createdBy,
        active: true,
        created_at: new Date(),
        updated_at: new Date()
      }).returning('id');

      logger.info(`Organization created: ${id} by user ${data.createdBy}`);
      return id;
    } catch (error) {
      logger.error('Error creating organization', { data, error });
      throw error;
    }
  }

  async getOrganizationById(id: string): Promise<Organization | null> {
    try {
      const org = await this.db('organizations').where({ id }).first();
      
      if (!org) {
        logger.warn(`Organization not found: ${id}`);
        return null;
      }

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        domain: org.domain,
        description: org.description,
        createdBy: org.created_by,
        active: org.active,
        createdAt: org.created_at,
        updatedAt: org.updated_at
      };
    } catch (error) {
      logger.error('Error fetching organization', { id, error });
      return null;
    }
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    try {
      const org = await this.db('organizations').where({ slug }).first();
      
      if (!org) {
        return null;
      }

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        domain: org.domain,
        description: org.description,
        createdBy: org.created_by,
        active: org.active,
        createdAt: org.created_at,
        updatedAt: org.updated_at
      };
    } catch (error) {
      logger.error('Error fetching organization by slug', { slug, error });
      return null;
    }
  }

  async updateOrganization(id: string, data: Partial<{
    name: string;
    domain: string;
    description: string;
    active: boolean;
  }>): Promise<void> {
    try {
      await this.db('organizations')
        .where({ id })
        .update({
          ...data,
          updated_at: new Date()
        });

      logger.info(`Organization updated: ${id}`);
    } catch (error) {
      logger.error('Error updating organization', { id, data, error });
      throw error;
    }
  }

  // Member Management
  async createMember(data: {
    organizationId: string;
    email: string;
    stellarPublicKey?: string;
    role: MemberRole;
    status?: MemberStatus;
    invitedBy?: string;
  }): Promise<string> {
    try {
      const [id] = await this.db('members').insert({
        organization_id: data.organizationId,
        email: data.email,
        stellar_public_key: data.stellarPublicKey,
        role: data.role,
        status: data.status || 'PENDING',
        invited_by: data.invitedBy,
        invited_at: data.invitedBy ? new Date() : null,
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date()
      }).returning('id');

      logger.info(`Member created: ${id} in organization ${data.organizationId}`);
      return id;
    } catch (error) {
      logger.error('Error creating member', { data, error });
      throw error;
    }
  }

  async getMemberById(id: string): Promise<MemberWithPermissions | null> {
    try {
      const member = await this.db('members').where({ id }).first();
      
      if (!member) {
        logger.warn(`Member not found: ${id}`);
        return null;
      }

      const permissions = getPermissionsForRole(member.role);

      return {
        id: member.id,
        organizationId: member.organization_id,
        email: member.email,
        stellarPublicKey: member.stellar_public_key,
        role: member.role,
        status: member.status,
        invitedBy: member.invited_by,
        invitedAt: member.invited_at,
        joinedAt: member.joined_at,
        lastLoginAt: member.last_login_at,
        emailVerified: member.email_verified,
        createdAt: member.created_at,
        updatedAt: member.updated_at,
        permissions
      };
    } catch (error) {
      logger.error('Error fetching member', { id, error });
      return null;
    }
  }

  async getMemberByEmail(organizationId: string, email: string): Promise<MemberWithPermissions | null> {
    try {
      const member = await this.db('members')
        .where({ organization_id: organizationId, email })
        .first();
      
      if (!member) {
        return null;
      }

      const permissions = getPermissionsForRole(member.role);

      return {
        id: member.id,
        organizationId: member.organization_id,
        email: member.email,
        stellarPublicKey: member.stellar_public_key,
        role: member.role,
        status: member.status,
        invitedBy: member.invited_by,
        invitedAt: member.invited_at,
        joinedAt: member.joined_at,
        lastLoginAt: member.last_login_at,
        emailVerified: member.email_verified,
        createdAt: member.created_at,
        updatedAt: member.updated_at,
        permissions
      };
    } catch (error) {
      logger.error('Error fetching member by email', { organizationId, email, error });
      return null;
    }
  }

  async getMemberByStellarPublicKey(organizationId: string, stellarPublicKey: string): Promise<MemberWithPermissions | null> {
    try {
      const member = await this.db('members')
        .where({ organization_id: organizationId, stellar_public_key: stellarPublicKey })
        .first();
      
      if (!member) {
        return null;
      }

      const permissions = getPermissionsForRole(member.role);

      return {
        id: member.id,
        organizationId: member.organization_id,
        email: member.email,
        stellarPublicKey: member.stellar_public_key,
        role: member.role,
        status: member.status,
        invitedBy: member.invited_by,
        invitedAt: member.invited_at,
        joinedAt: member.joined_at,
        lastLoginAt: member.last_login_at,
        emailVerified: member.email_verified,
        createdAt: member.created_at,
        updatedAt: member.updated_at,
        permissions
      };
    } catch (error) {
      logger.error('Error fetching member by Stellar public key', { organizationId, stellarPublicKey, error });
      return null;
    }
  }

  async getOrganizationMembers(organizationId: string): Promise<MemberWithPermissions[]> {
    try {
      const members = await this.db('members')
        .where({ organization_id: organizationId })
        .orderBy('created_at', 'asc');

      return members.map((member: any) => {
        const permissions = getPermissionsForRole(member.role);
        
        return {
          id: member.id,
          organizationId: member.organization_id,
          email: member.email,
          stellarPublicKey: member.stellar_public_key,
          role: member.role,
          status: member.status,
          invitedBy: member.invited_by,
          invitedAt: member.invited_at,
          joinedAt: member.joined_at,
          lastLoginAt: member.last_login_at,
          emailVerified: member.email_verified,
          createdAt: member.created_at,
          updatedAt: member.updated_at,
          permissions
        };
      });
    } catch (error) {
      logger.error('Error fetching organization members', { organizationId, error });
      return [];
    }
  }

  async updateMember(id: string, data: Partial<{
    stellarPublicKey: string;
    role: MemberRole;
    status: MemberStatus;
    emailVerified: boolean;
    lastLoginAt: Date;
  }>): Promise<void> {
    try {
      await this.db('members')
        .where({ id })
        .update({
          ...data,
          updated_at: new Date()
        });

      logger.info(`Member updated: ${id}`);
    } catch (error) {
      logger.error('Error updating member', { id, data, error });
      throw error;
    }
  }

  async activateMember(id: string, stellarPublicKey: string): Promise<void> {
    try {
      await this.db('members')
        .where({ id })
        .update({
          stellar_public_key: stellarPublicKey,
          status: 'ACTIVE',
          joined_at: new Date(),
          email_verified: true,
          updated_at: new Date()
        });

      logger.info(`Member activated: ${id} with Stellar pubkey ${stellarPublicKey}`);
    } catch (error) {
      logger.error('Error activating member', { id, stellarPublicKey, error });
      throw error;
    }
  }

  async removeMember(id: string): Promise<void> {
    try {
      await this.db('members').where({ id }).del();
      logger.info(`Member removed: ${id}`);
    } catch (error) {
      logger.error('Error removing member', { id, error });
      throw error;
    }
  }

  // Invitation Management
  async createInvitation(data: {
    organizationId: string;
    invitedBy: string;
    email: string;
    role: MemberRole;
    message?: string;
    expiresInDays?: number;
  }): Promise<string> {
    try {
      const token = this.generateInvitationToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (data.expiresInDays || 7));

      const [id] = await this.db('invitations').insert({
        organization_id: data.organizationId,
        invited_by: data.invitedBy,
        email: data.email,
        role: data.role,
        token,
        status: 'PENDING',
        expires_at: expiresAt,
        message: data.message,
        created_at: new Date(),
        updated_at: new Date()
      }).returning('id');

      logger.info(`Invitation created: ${id} for ${data.email}`);
      return id;
    } catch (error) {
      logger.error('Error creating invitation', { data, error });
      throw error;
    }
  }

  async getInvitationByToken(token: string): Promise<Invitation | null> {
    try {
      const invitation = await this.db('invitations').where({ token }).first();
      
      if (!invitation) {
        return null;
      }

      // Check if invitation is expired
      if (new Date() > invitation.expires_at) {
        await this.updateInvitationStatus(invitation.id, 'EXPIRED');
        return null;
      }

      return {
        id: invitation.id,
        organizationId: invitation.organization_id,
        invitedBy: invitation.invited_by,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        status: invitation.status,
        expiresAt: invitation.expires_at,
        acceptedAt: invitation.accepted_at,
        message: invitation.message,
        createdAt: invitation.created_at,
        updatedAt: invitation.updated_at
      };
    } catch (error) {
      logger.error('Error fetching invitation by token', { token, error });
      return null;
    }
  }

  async updateInvitationStatus(id: string, status: InvitationStatus): Promise<void> {
    try {
      const updateData: any = { status, updated_at: new Date() };
      
      if (status === 'ACCEPTED') {
        updateData.accepted_at = new Date();
      }

      await this.db('invitations').where({ id }).update(updateData);
      logger.info(`Invitation status updated: ${id} to ${status}`);
    } catch (error) {
      logger.error('Error updating invitation status', { id, status, error });
      throw error;
    }
  }

  async getPendingInvitations(organizationId: string): Promise<Invitation[]> {
    try {
      const invitations = await this.db('invitations')
        .where({ 
          organization_id: organizationId, 
          status: 'PENDING' 
        })
        .where('expires_at', '>', new Date())
        .orderBy('created_at', 'desc');

      return invitations.map((inv: any) => ({
        id: inv.id,
        organizationId: inv.organization_id,
        invitedBy: inv.invited_by,
        email: inv.email,
        role: inv.role,
        token: inv.token,
        status: inv.status,
        expiresAt: inv.expires_at,
        acceptedAt: inv.accepted_at,
        message: inv.message,
        createdAt: inv.created_at,
        updatedAt: inv.updated_at
      }));
    } catch (error) {
      logger.error('Error fetching pending invitations', { organizationId, error });
      return [];
    }
  }

  // Helper methods
  private generateInvitationToken(): string {
    const bytes = randomBytes(32);
    return bytes.toString('hex');
  }

  async memberHasPermission(memberId: string, permission: string): Promise<boolean> {
    try {
      const member = await this.getMemberById(memberId);
      if (!member) {
        return false;
      }

      return member.permissions.includes(permission);
    } catch (error) {
      logger.error('Error checking member permission', { memberId, permission, error });
      return false;
    }
  }
}

export const organizationService = new OrganizationService();
