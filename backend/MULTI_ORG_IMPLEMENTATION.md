# Multi-Organization Team Management Implementation

This document describes the complete implementation of Issue #212: "Multi-Organization" Team Management for the SubStream Protocol Backend.

## Overview

The implementation transforms the single-merchant system into a multi-tenant, enterprise-ready platform with:
- Organization-based multi-tenancy
- Role-Based Access Control (RBAC)
- Secure member invitation system
- Stellar public key authentication
- Complete tenant isolation

## Architecture

### Database Schema

#### New Tables
1. **organizations** - Organization entities
   - `id` (UUID, Primary Key)
   - `name` (String)
   - `slug` (String, Unique)
   - `domain` (String, Optional)
   - `description` (Text, Optional)
   - `created_by` (UUID)
   - `active` (Boolean)
   - `created_at`, `updated_at` (Timestamps)

2. **members** - Organization members
   - `id` (UUID, Primary Key)
   - `organization_id` (UUID, Foreign Key)
   - `email` (String)
   - `stellar_public_key` (String, Optional)
   - `role` (Enum: ADMIN, VIEWER, BILLING_MANAGER)
   - `status` (Enum: PENDING, ACTIVE, INACTIVE)
   - `invited_by` (UUID, Foreign Key to members)
   - `invited_at`, `joined_at`, `last_login_at` (Timestamps)
   - `email_verified` (Boolean)

3. **invitations** - Member invitations
   - `id` (UUID, Primary Key)
   - `organization_id` (UUID, Foreign Key)
   - `invited_by` (UUID, Foreign Key)
   - `email` (String)
   - `role` (Enum: ADMIN, VIEWER, BILLING_MANAGER)
   - `token` (String, Unique)
   - `status` (Enum: PENDING, ACCEPTED, EXPIRED, CANCELLED)
   - `expires_at` (Timestamp)
   - `message` (Text, Optional)

#### Enhanced Tables
4. **merchants** - Enhanced with organization support
   - `organization_id` (UUID, Foreign Key, Optional)
   - `owner_member_id` (UUID, Foreign Key, Optional)
   - `tenant_id` (String) - For multi-tenancy

5. **merchant_balances** - Added tenant isolation
   - `tenant_id` (String)

6. **treasury_snapshots** - Added tenant isolation
   - `tenant_id` (String)

### Role-Based Access Control (RBAC)

#### Roles and Permissions

**ADMIN**
- `org:read`, `org:write`, `org:delete`
- `members:read`, `members:write`, `members:delete`, `members:invite`
- `merchants:read`, `merchants:write`, `merchants:delete`
- `billing:read`, `billing:write`, `billing:delete`
- `analytics:read`, `treasury:read`, `treasury:write`

**VIEWER**
- `org:read`, `members:read`
- `merchants:read`, `billing:read`
- `analytics:read`, `treasury:read`

**BILLING_MANAGER**
- `org:read`, `members:read`
- `merchants:read`, `billing:read`, `billing:write`
- `analytics:read`, `treasury:read`

## API Endpoints

### Authentication (`/api/v1/auth/member`)
- `POST /login` - Member login with Stellar public key
- `POST /refresh` - Refresh access token
- `POST /logout` - Member logout
- `GET /me` - Get current member profile
- `POST /verify-stellar` - Verify Stellar signature

### Organizations (`/api/v1/organizations`)
- `POST /` - Create organization
- `GET /:id` - Get organization by ID
- `PUT /:id` - Update organization
- `GET /:id/members` - Get organization members
- `POST /:id/members` - Add member to organization
- `PUT /:id/members/:memberId` - Update member
- `DELETE /:id/members/:memberId` - Remove member

### Invitations (`/api/v1/invitations`)
- `POST /:id/invitations` - Create invitation
- `GET /:id/invitations` - Get pending invitations
- `POST /invitations/:token/accept` - Accept invitation
- `POST /invitations/:token/cancel` - Cancel invitation
- `GET /invitations/:token` - Get invitation details (public)

### Enhanced Merchants (`/api/v1/merchants/enhanced`)
- `POST /` - Create merchant (with organization context)
- `GET /` - Get merchants (organization-scoped)
- `GET /:id` - Get merchant (tenant-isolated)
- `PUT /:id` - Update merchant (tenant-isolated)
- `DELETE /:id` - Delete merchant (tenant-isolated)
- `GET /:id/balances` - Get merchant balances (tenant-isolated)
- `POST /:id/transfer` - Transfer merchant between organizations

## Security Features

### Multi-Tenant Isolation
- All data access is scoped by `tenant_id`
- Members can only access their organization's data
- Cross-organization access requires special permissions

### Authentication
- JWT-based authentication with Stellar signature verification
- Role-based permissions embedded in JWT tokens
- Secure token refresh mechanism
- Session management with HTTP-only cookies

### Invitation System
- Cryptographically secure invitation tokens
- Email-based invitations with expiration
- Role assignment at invitation time
- Invitation status tracking (PENDING, ACCEPTED, EXPIRED, CANCELLED)

### Access Control
- Permission-based middleware for all protected endpoints
- Role hierarchy enforcement
- Tenant isolation verification
- Audit logging for all access attempts

## Implementation Files

### Core Services
- `src/services/organizationService.ts` - Organization and member management
- `src/services/enhancedMerchantService.ts` - Tenant-aware merchant operations
- `src/services/authService.ts` - JWT token generation and verification
- `src/services/emailService.ts` - Invitation email sending

### Middleware
- `src/middleware/rbacAuth.ts` - RBAC authentication and authorization
- `src/middleware/stellarAuth.ts` - Existing Stellar authentication (enhanced)

### Models
- `src/models/organization.ts` - Organization, Member, Invitation interfaces
- `src/models/merchant.ts` - Enhanced merchant interfaces

### Routes
- `src/routes/organizations.ts` - Organization management endpoints
- `src/routes/invitations.ts` - Invitation system endpoints
- `src/routes/memberAuth.ts` - Member authentication endpoints
- `src/routes/enhancedMerchants.ts` - Tenant-aware merchant endpoints

### Database Migrations
- `migrations/005_create_organizations_table.ts`
- `migrations/006_create_members_table.ts`
- `migrations/007_create_invitations_table.ts`
- `migrations/008_update_merchants_for_organizations.ts`

### Tests
- `src/tests/organizationService.test.ts` - Organization service unit tests
- `src/tests/rbacAuth.test.ts` - RBAC middleware tests
- `src/tests/integration.test.ts` - Full integration tests

## Acceptance Criteria Fulfillment

### ✅ Acceptance 1: Corporate teams can securely collaborate on a single merchant account without sharing private keys
- **Implementation**: Each member authenticates with their own Stellar public key
- **Security**: Private keys never leave the member's control
- **Collaboration**: Members share access to organization merchants via roles

### ✅ Acceptance 2: Granular permissions prevent unauthorized employees from altering critical billing configurations
- **Implementation**: Role-based permissions with fine-grained access control
- **Roles**: VIEWER (read-only), BILLING_MANAGER (billing access), ADMIN (full access)
- **Enforcement**: Permission middleware on all sensitive endpoints

### ✅ Acceptance 3: Access is revocable, allowing organizations to manage employee turnover safely
- **Implementation**: Member removal and status management
- **Revocation**: Immediate access termination upon member removal
- **Audit**: Complete audit trail of all access changes

## Migration Strategy

### Phase 1: Database Schema
1. Run new migrations to create organization tables
2. Update existing merchants with tenant_id
3. Migrate existing single-merchant accounts to organizations

### Phase 2: API Integration
1. Deploy new authentication middleware
2. Enable organization endpoints
3. Update existing merchant endpoints with RBAC protection

### Phase 3: Client Integration
1. Update frontend to use organization-based authentication
2. Implement invitation flow for new members
3. Add role management UI for administrators

## Configuration

### Environment Variables
```bash
# Stellar Authentication
STELLAR_PUBLIC_KEY=your_stellar_public_key
STELLAR_PRIVATE_KEY=your_stellar_private_key
STELLAR_ALLOWED_ISSUERS=stellar-privacy
STELLAR_ALLOWED_AUDIENCES=stellar-api
STELLAR_CLOCK_SKEW_TOLERANCE=30

# Email Service
FRONTEND_URL=https://app.stellar-privacy.com
FROM_EMAIL=noreply@stellar-privacy.com

# JWT Configuration
JWT_ISSUER=stellar-privacy
JWT_AUDIENCE=stellar-api
JWT_EXPIRATION=24h
```

## Testing

### Unit Tests
- Organization service operations
- RBAC middleware functionality
- JWT token generation and validation

### Integration Tests
- Full authentication flow
- Organization and member management
- Permission enforcement
- Tenant isolation

### Security Tests
- Authentication bypass attempts
- Cross-tenant access prevention
- Permission escalation attempts
- Invitation token security

## Monitoring and Auditing

### Audit Events
- Member login/logout
- Organization creation/modification
- Member invitation/acceptance/removal
- Permission changes
- Data access attempts

### Metrics
- Authentication success/failure rates
- Organization activity metrics
- Permission violation attempts
- Invitation acceptance rates

## Future Enhancements

### SSO Integration
- SAML/OIDC support for enterprise SSO
- Domain-based organization auto-discovery
- LDAP/Active Directory integration

### Advanced Permissions
- Custom role creation
- Resource-level permissions
- Time-based access controls
- IP-based restrictions

### Enhanced Security
- Multi-factor authentication
- Hardware security key support
- Advanced threat detection
- Automated security policies

## Conclusion

This implementation successfully transforms the SubStream Protocol Backend into a multi-tenant, enterprise-ready platform that meets all acceptance criteria for Issue #212. The system provides:

1. **Secure Collaboration**: Teams can work together without sharing private keys
2. **Granular Control**: Fine-grained permissions prevent unauthorized access
3. **Flexible Management**: Complete control over member access and roles
4. **Enterprise Security**: Multi-tenant isolation with comprehensive audit trails
5. **Scalable Architecture**: Designed for growth and future enhancements

The implementation maintains backward compatibility while providing a clear migration path for existing single-merchant accounts to the new organization-based system.
