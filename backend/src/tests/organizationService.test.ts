import { organizationService } from '../services/organizationService';
import { MemberRole, MemberStatus, InvitationStatus } from '../models/organization';
import { databaseManager } from '../config/database';

describe('OrganizationService', () => {
  let organizationId: string;
  let memberId: string;
  let invitationId: string;

  beforeAll(async () => {
    // Setup test database connection
    await databaseManager.getConnection();
  });

  afterAll(async () => {
    // Cleanup test data
    await databaseManager.getConnection()('organizations').del();
    await databaseManager.getConnection()('members').del();
    await databaseManager.getConnection()('invitations').del();
  });

  describe('Organization Management', () => {
    test('should create a new organization', async () => {
      const orgData = {
        name: 'Test Organization',
        slug: 'test-org',
        domain: 'test.com',
        description: 'Test organization for unit tests',
        createdBy: 'test-user-id'
      };

      organizationId = await organizationService.createOrganization(orgData);
      expect(organizationId).toBeDefined();
      expect(typeof organizationId).toBe('string');
    });

    test('should retrieve organization by ID', async () => {
      const organization = await organizationService.getOrganizationById(organizationId);
      
      expect(organization).toBeDefined();
      expect(organization?.name).toBe('Test Organization');
      expect(organization?.slug).toBe('test-org');
      expect(organization?.domain).toBe('test.com');
      expect(organization?.createdBy).toBe('test-user-id');
      expect(organization?.active).toBe(true);
    });

    test('should retrieve organization by slug', async () => {
      const organization = await organizationService.getOrganizationBySlug('test-org');
      
      expect(organization).toBeDefined();
      expect(organization?.id).toBe(organizationId);
      expect(organization?.name).toBe('Test Organization');
    });

    test('should update organization details', async () => {
      await organizationService.updateOrganization(organizationId, {
        name: 'Updated Organization',
        description: 'Updated description'
      });

      const organization = await organizationService.getOrganizationById(organizationId);
      expect(organization?.name).toBe('Updated Organization');
      expect(organization?.description).toBe('Updated description');
    });

    test('should return null for non-existent organization', async () => {
      const organization = await organizationService.getOrganizationById('non-existent-id');
      expect(organization).toBeNull();
    });
  });

  describe('Member Management', () => {
    test('should create a new member', async () => {
      const memberData = {
        organizationId,
        email: 'test@example.com',
        stellarPublicKey: 'GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCD',
        role: 'ADMIN' as MemberRole,
        invitedBy: 'test-user-id'
      };

      memberId = await organizationService.createMember(memberData);
      expect(memberId).toBeDefined();
      expect(typeof memberId).toBe('string');
    });

    test('should retrieve member by ID with permissions', async () => {
      const member = await organizationService.getMemberById(memberId);
      
      expect(member).toBeDefined();
      expect(member?.email).toBe('test@example.com');
      expect(member?.role).toBe('ADMIN');
      expect(member?.status).toBe('PENDING');
      expect(member?.permissions).toContain('org:read');
      expect(member?.permissions).toContain('org:write');
      expect(member?.permissions).toContain('members:invite');
    });

    test('should retrieve member by email', async () => {
      const member = await organizationService.getMemberByEmail(organizationId, 'test@example.com');
      
      expect(member).toBeDefined();
      expect(member?.id).toBe(memberId);
      expect(member?.email).toBe('test@example.com');
    });

    test('should retrieve member by Stellar public key', async () => {
      const stellarPublicKey = 'GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCD';
      const member = await organizationService.getMemberByStellarPublicKey(organizationId, stellarPublicKey);
      
      expect(member).toBeDefined();
      expect(member?.id).toBe(memberId);
      expect(member?.stellarPublicKey).toBe(stellarPublicKey);
    });

    test('should get all organization members', async () => {
      // Add another member
      await organizationService.createMember({
        organizationId,
        email: 'member2@example.com',
        role: 'VIEWER' as MemberRole,
        invitedBy: memberId
      });

      const members = await organizationService.getOrganizationMembers(organizationId);
      expect(members).toHaveLength(2);
      expect(members[0].email).toBe('test@example.com');
      expect(members[0].role).toBe('ADMIN');
      expect(members[1].email).toBe('member2@example.com');
      expect(members[1].role).toBe('VIEWER');
    });

    test('should update member role and status', async () => {
      await organizationService.updateMember(memberId, {
        role: 'BILLING_MANAGER' as MemberRole,
        status: 'ACTIVE' as MemberStatus
      });

      const member = await organizationService.getMemberById(memberId);
      expect(member?.role).toBe('BILLING_MANAGER');
      expect(member?.status).toBe('ACTIVE');
      expect(member?.permissions).toContain('billing:read');
      expect(member?.permissions).toContain('billing:write');
      expect(member?.permissions).not.toContain('org:delete');
    });

    test('should activate member with Stellar public key', async () => {
      const stellarPublicKey = 'GDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCD';
      await organizationService.activateMember(memberId, stellarPublicKey);

      const member = await organizationService.getMemberById(memberId);
      expect(member?.stellarPublicKey).toBe(stellarPublicKey);
      expect(member?.status).toBe('ACTIVE');
      expect(member?.emailVerified).toBe(true);
      expect(member?.joinedAt).toBeDefined();
    });

    test('should remove member', async () => {
      const tempMemberId = await organizationService.createMember({
        organizationId,
        email: 'temp@example.com',
        role: 'VIEWER' as MemberRole
      });

      await organizationService.removeMember(tempMemberId);
      
      const member = await organizationService.getMemberById(tempMemberId);
      expect(member).toBeNull();
    });
  });

  describe('Invitation Management', () => {
    test('should create invitation', async () => {
      const invitationData = {
        organizationId,
        invitedBy: memberId,
        email: 'invite@example.com',
        role: 'VIEWER' as MemberRole,
        message: 'Welcome to our team!',
        expiresInDays: 7
      };

      invitationId = await organizationService.createInvitation(invitationData);
      expect(invitationId).toBeDefined();
      expect(typeof invitationId).toBe('string');
    });

    test('should retrieve invitation by token', async () => {
      const invitations = await organizationService.getPendingInvitations(organizationId);
      const token = invitations[0].token;
      
      const invitation = await organizationService.getInvitationByToken(token);
      
      expect(invitation).toBeDefined();
      expect(invitation?.email).toBe('invite@example.com');
      expect(invitation?.role).toBe('VIEWER');
      expect(invitation?.status).toBe('PENDING');
      expect(invitation?.message).toBe('Welcome to our team!');
    });

    test('should get pending invitations', async () => {
      const invitations = await organizationService.getPendingInvitations(organizationId);
      expect(invitations).toHaveLength(1);
      expect(invitations[0].email).toBe('invite@example.com');
      expect(invitations[0].status).toBe('PENDING');
    });

    test('should update invitation status', async () => {
      await organizationService.updateInvitationStatus(invitationId, 'ACCEPTED' as InvitationStatus);
      
      const invitations = await organizationService.getPendingInvitations(organizationId);
      expect(invitations).toHaveLength(0);
    });

    test('should return null for expired invitation', async () => {
      // Create an invitation that expires immediately
      const expiredInvitationId = await organizationService.createInvitation({
        organizationId,
        invitedBy: memberId,
        email: 'expired@example.com',
        role: 'VIEWER' as MemberRole,
        expiresInDays: -1 // Expired
      });

      const invitations = await organizationService.getPendingInvitations(organizationId);
      const expiredInvitation = invitations.find(inv => inv.id === expiredInvitationId);
      expect(expiredInvitation).toBeUndefined();
    });
  });

  describe('Permission Management', () => {
    test('should check member permissions correctly', async () => {
      const hasPermission = await organizationService.memberHasPermission(memberId, 'billing:write');
      expect(hasPermission).toBe(true);

      const noPermission = await organizationService.memberHasPermission(memberId, 'org:delete');
      expect(noPermission).toBe(false);
    });

    test('should return false for non-existent member permission check', async () => {
      const hasPermission = await organizationService.memberHasPermission('non-existent-member', 'org:read');
      expect(hasPermission).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle duplicate organization slug', async () => {
      const orgData = {
        name: 'Duplicate Organization',
        slug: 'test-org', // Same slug as existing org
        createdBy: 'test-user-id'
      };

      await expect(organizationService.createOrganization(orgData)).rejects.toThrow();
    });

    test('should handle duplicate member email in organization', async () => {
      await expect(organizationService.createMember({
        organizationId,
        email: 'test@example.com', // Same email as existing member
        role: 'VIEWER' as MemberRole
      })).rejects.toThrow();
    });

    test('should handle invalid organization ID', async () => {
      const organization = await organizationService.getOrganizationById('invalid-uuid');
      expect(organization).toBeNull();
    });
  });
});
