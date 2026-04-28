import request from 'supertest';
import express from 'express';
import { organizationRoutes } from '../routes/organizations';
import { invitationRoutes } from '../routes/invitations';
import { memberAuthRoutes } from '../routes/memberAuth';
import { rbacAuth } from '../middleware/rbacAuth';
import { organizationService } from '../services/organizationService';
import { authService } from '../services/authService';

// Mock dependencies
jest.mock('../services/organizationService');
jest.mock('../services/authService');
jest.mock('../utils/logger');

describe('Organization Management Integration Tests', () => {
  let app: express.Application;
  let organizationId: string;
  let memberId: string;
  let authToken: string;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware for testing
    app.use('/api/v1/organizations', (req, res, next) => {
      req.member = {
        id: memberId || 'test-member-id',
        organizationId: organizationId || 'test-org-id',
        email: 'test@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
        permissions: ['org:read', 'org:write', 'members:read', 'members:write', 'members:invite'],
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      req.tenantId = organizationId || 'test-org-id';
      next();
    });
    
    app.use('/api/v1/organizations', organizationRoutes);
    app.use('/api/v1/invitations', invitationRoutes);
    app.use('/api/v1/auth/member', memberAuthRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Organization CRUD Operations', () => {
    test('should create a new organization', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.createOrganization.mockResolvedValue('new-org-id');
      mockOrgService.getOrganizationBySlug.mockResolvedValue(null);
      mockOrgService.createMember.mockResolvedValue('new-member-id');
      mockOrgService.getOrganizationById.mockResolvedValue({
        id: 'new-org-id',
        name: 'Test Organization',
        slug: 'test-org',
        createdBy: 'test-member-id',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const response = await request(app)
        .post('/api/v1/organizations')
        .send({
          name: 'Test Organization',
          slug: 'test-org',
          description: 'Test organization'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Test Organization');
      expect(mockOrgService.createOrganization).toHaveBeenCalled();
    });

    test('should reject duplicate organization slug', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getOrganizationBySlug.mockResolvedValue({
        id: 'existing-org-id',
        name: 'Existing Organization',
        slug: 'test-org'
      });

      const response = await request(app)
        .post('/api/v1/organizations')
        .send({
          name: 'Test Organization',
          slug: 'test-org'
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Conflict');
    });

    test('should retrieve organization by ID', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getOrganizationById.mockResolvedValue({
        id: organizationId,
        name: 'Test Organization',
        slug: 'test-org',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(organizationId);
    });

    test('should update organization details', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getOrganizationById.mockResolvedValue({
        id: organizationId,
        name: 'Test Organization',
        slug: 'test-org',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      mockOrgService.updateOrganization.mockResolvedValue();

      const response = await request(app)
        .put(`/api/v1/organizations/${organizationId}`)
        .send({
          name: 'Updated Organization',
          description: 'Updated description'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockOrgService.updateOrganization).toHaveBeenCalledWith(
        organizationId,
        expect.objectContaining({
          name: 'Updated Organization'
        })
      );
    });
  });

  describe('Member Management', () => {
    test('should add member to organization', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getMemberByEmail.mockResolvedValue(null);
      mockOrgService.createMember.mockResolvedValue('new-member-id');
      mockOrgService.getMemberById.mockResolvedValue({
        id: 'new-member-id',
        email: 'newmember@example.com',
        role: 'VIEWER',
        status: 'ACTIVE',
        permissions: ['org:read', 'members:read'],
        organizationId,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const response = await request(app)
        .post(`/api/v1/organizations/${organizationId}/members`)
        .send({
          email: 'newmember@example.com',
          role: 'VIEWER'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('newmember@example.com');
      expect(response.body.data.role).toBe('VIEWER');
    });

    test('should reject duplicate member email', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getMemberByEmail.mockResolvedValue({
        id: 'existing-member-id',
        email: 'existing@example.com',
        role: 'VIEWER'
      });

      const response = await request(app)
        .post(`/api/v1/organizations/${organizationId}/members`)
        .send({
          email: 'existing@example.com',
          role: 'VIEWER'
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Conflict');
    });

    test('should retrieve organization members', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getOrganizationMembers.mockResolvedValue([
        {
          id: 'member-1',
          email: 'member1@example.com',
          role: 'ADMIN',
          status: 'ACTIVE',
          permissions: ['org:read', 'org:write'],
          organizationId,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'member-2',
          email: 'member2@example.com',
          role: 'VIEWER',
          status: 'ACTIVE',
          permissions: ['org:read'],
          organizationId,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);

      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/members`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });

    test('should update member role', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getMemberById.mockResolvedValue({
        id: memberId,
        email: 'test@example.com',
        role: 'VIEWER',
        status: 'ACTIVE',
        permissions: ['org:read'],
        organizationId,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      mockOrgService.updateMember.mockResolvedValue();

      const response = await request(app)
        .put(`/api/v1/organizations/${organizationId}/members/${memberId}`)
        .send({
          role: 'BILLING_MANAGER'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockOrgService.updateMember).toHaveBeenCalledWith(
        memberId,
        expect.objectContaining({
          role: 'BILLING_MANAGER'
        })
      );
    });

    test('should remove member from organization', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getMemberById.mockResolvedValue({
        id: memberId,
        email: 'test@example.com',
        role: 'VIEWER',
        status: 'ACTIVE',
        permissions: ['org:read'],
        organizationId,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      mockOrgService.removeMember.mockResolvedValue();

      const response = await request(app)
        .delete(`/api/v1/organizations/${organizationId}/members/${memberId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockOrgService.removeMember).toHaveBeenCalledWith(memberId);
    });

    test('should prevent self-removal', async () => {
      const response = await request(app)
        .delete(`/api/v1/organizations/${organizationId}/members/test-member-id`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Bad Request');
      expect(response.body.message).toBe('Cannot remove yourself from organization');
    });
  });

  describe('Invitation System', () => {
    test('should create and send invitation', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getMemberByEmail.mockResolvedValue(null);
      mockOrgService.getPendingInvitations.mockResolvedValue([]);
      mockOrgService.createInvitation.mockResolvedValue('invitation-id');
      mockOrgService.getInvitationByToken.mockResolvedValue({
        id: 'invitation-id',
        email: 'invite@example.com',
        role: 'VIEWER',
        token: 'test-token',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      const response = await request(app)
        .post(`/api/v1/organizations/${organizationId}/invitations`)
        .send({
          email: 'invite@example.com',
          role: 'VIEWER',
          message: 'Welcome to our team!'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('invite@example.com');
      expect(mockOrgService.createInvitation).toHaveBeenCalled();
    });

    test('should reject invitation for existing member', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getMemberByEmail.mockResolvedValue({
        id: 'existing-member-id',
        email: 'existing@example.com',
        role: 'VIEWER'
      });

      const response = await request(app)
        .post(`/api/v1/organizations/${organizationId}/invitations`)
        .send({
          email: 'existing@example.com',
          role: 'VIEWER'
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Conflict');
    });

    test('should retrieve pending invitations', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getPendingInvitations.mockResolvedValue([
        {
          id: 'invitation-1',
          email: 'invite1@example.com',
          role: 'VIEWER',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      ]);

      const response = await request(app)
        .get(`/api/v1/organizations/${organizationId}/invitations`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    test('should accept invitation with Stellar public key', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getInvitationByToken.mockResolvedValue({
        id: 'invitation-id',
        organizationId,
        email: 'invite@example.com',
        role: 'VIEWER',
        token: 'test-token',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
      mockOrgService.getMemberByStellarPublicKey.mockResolvedValue(null);
      mockOrgService.createMember.mockResolvedValue('new-member-id');
      mockOrgService.updateInvitationStatus.mockResolvedValue();
      mockOrgService.getMemberById.mockResolvedValue({
        id: 'new-member-id',
        email: 'invite@example.com',
        role: 'VIEWER',
        status: 'ACTIVE',
        permissions: ['org:read'],
        organizationId,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const response = await request(app)
        .post('/api/v1/invitations/test-token/accept')
        .send({
          stellarPublicKey: 'GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCD'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(mockOrgService.createMember).toHaveBeenCalled();
      expect(mockOrgService.updateInvitationStatus).toHaveBeenCalledWith('invitation-id', 'ACCEPTED');
    });
  });

  describe('Authentication Flow', () => {
    test('should authenticate member with Stellar public key', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getOrganizationBySlug.mockResolvedValue({
        id: organizationId,
        name: 'Test Organization',
        slug: 'test-org'
      });
      mockOrgService.getMemberByStellarPublicKey.mockResolvedValue({
        id: memberId,
        email: 'test@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
        permissions: ['org:read', 'org:write'],
        organizationId,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const mockAuthService = authService as jest.Mocked<typeof authService>;
      mockAuthService.generateMemberToken.mockReturnValue('jwt-token');
      mockAuthService.generateRefreshToken.mockReturnValue('refresh-token');

      const response = await request(app)
        .post('/api/v1/auth/member/login')
        .send({
          stellarPublicKey: 'GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCD',
          organizationSlug: 'test-org'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBe('jwt-token');
      expect(response.body.data.member.email).toBe('test@example.com');
      expect(mockAuthService.generateMemberToken).toHaveBeenCalled();
    });

    test('should reject login for inactive member', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getOrganizationBySlug.mockResolvedValue({
        id: organizationId,
        name: 'Test Organization',
        slug: 'test-org'
      });
      mockOrgService.getMemberByStellarPublicKey.mockResolvedValue({
        id: memberId,
        email: 'test@example.com',
        role: 'ADMIN',
        status: 'INACTIVE', // Inactive member
        permissions: [],
        organizationId,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const response = await request(app)
        .post('/api/v1/auth/member/login')
        .send({
          stellarPublicKey: 'GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCD',
          organizationSlug: 'test-org'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
    });

    test('should get current member profile', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getOrganizationById.mockResolvedValue({
        id: organizationId,
        name: 'Test Organization',
        slug: 'test-org',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const response = await request(app)
        .get('/api/v1/auth/member/me');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('test@example.com');
      expect(response.body.data.organization).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/v1/organizations')
        .send({
          name: '', // Invalid: too short
          slug: 'invalid slug with spaces' // Invalid: contains spaces
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });

    test('should handle not found errors', async () => {
      const mockOrgService = organizationService as jest.Mocked<typeof organizationService>;
      mockOrgService.getOrganizationById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/organizations/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not Found');
    });

    test('should handle permission denied errors', async () => {
      // Mock member with limited permissions
      const appWithLimitedPermissions = express();
      appWithLimitedPermissions.use(express.json());
      appWithLimitedPermissions.use('/api/v1/organizations', (req, res, next) => {
        req.member = {
          id: 'limited-member-id',
          organizationId,
          email: 'limited@example.com',
          role: 'VIEWER',
          status: 'ACTIVE',
          permissions: ['org:read'], // Limited permissions
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        req.tenantId = organizationId;
        next();
      });
      appWithLimitedPermissions.use('/api/v1/organizations', organizationRoutes);

      const response = await request(appWithLimitedPermissions)
        .post(`/api/v1/organizations/${organizationId}/members`)
        .send({
          email: 'new@example.com',
          role: 'VIEWER'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
    });
  });
});
