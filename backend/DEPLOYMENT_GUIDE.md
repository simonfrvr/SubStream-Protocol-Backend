# Multi-Organization Deployment Guide

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 13+
- Redis (for caching and session management)
- Environment variables configured

## Database Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Database
Update your `.env` file:
```env
DATABASE_URL=postgresql://username:password@localhost:5432/stellar_privacy
REDIS_URL=redis://localhost:6379
```

### 3. Run Migrations
```bash
npm run migrate
```

This will create:
- `organizations` table
- `members` table  
- `invitations` table
- Enhanced `merchants` table with organization support
- Updated `merchant_balances` and `treasury_snapshots` with tenant isolation

### 4. Seed Initial Data (Optional)
```bash
npm run seed
```

## Environment Configuration

### Required Environment Variables
```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/stellar_privacy
REDIS_URL=redis://localhost:6379

# Stellar Authentication
STELLAR_PUBLIC_KEY=your_stellar_public_key
STELLAR_PRIVATE_KEY=your_stellar_private_key
STELLAR_ALLOWED_ISSUERS=stellar-privacy
STELLAR_ALLOWED_AUDIENCES=stellar-api
STELLAR_CLOCK_SKEW_TOLERANCE=30

# JWT Configuration
JWT_ISSUER=stellar-privacy
JWT_AUDIENCE=stellar-api
JWT_EXPIRATION=24h

# Email Service
FRONTEND_URL=https://app.stellar-privacy.com
FROM_EMAIL=noreply@stellar-privacy.com

# API Configuration
API_PORT=3001
API_HOST=localhost
NODE_ENV=production
```

## Application Startup

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## Migration Strategy for Existing Accounts

### Phase 1: Database Migration
1. Backup existing database
2. Run new migrations
3. Existing merchants will automatically get `tenant_id` set to their ID

### Phase 2: Organization Creation
Create organizations for existing merchant accounts:

```sql
-- Example migration script for existing merchants
INSERT INTO organizations (name, slug, created_by, active, created_at, updated_at)
SELECT 
    name as organization_name,
    LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '-', 'g')) as slug,
    'system-migration' as created_by,
    true as active,
    NOW() as created_at,
    NOW() as updated_at
FROM merchants
WHERE id NOT IN (SELECT DISTINCT organization_id FROM merchants WHERE organization_id IS NOT NULL);
```

### Phase 3: Member Migration
Create admin members for existing merchant owners:

```sql
-- Create admin members for existing merchant accounts
INSERT INTO members (organization_id, email, stellar_public_key, role, status, invited_at, email_verified, created_at, updated_at)
SELECT 
    o.id as organization_id,
    'admin@' || o.slug || '.com' as email,
    'MERCHANT_OWNER_PUBKEY' as stellar_public_key, -- Replace with actual pubkey
    'ADMIN' as role,
    'ACTIVE' as status,
    NOW() as invited_at,
    true as email_verified,
    NOW() as created_at,
    NOW() as updated_at
FROM organizations o
WHERE o.created_by = 'system-migration';
```

## Testing the Implementation

### 1. Run Unit Tests
```bash
npm test
```

### 2. Run Integration Tests
```bash
npm run test:integration
```

### 3. Manual Testing Steps

#### Create Organization
```bash
curl -X POST http://localhost:3001/api/v1/organizations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Test Organization",
    "slug": "test-org",
    "description": "Test organization for manual testing"
  }'
```

#### Create Member
```bash
curl -X POST http://localhost:3001/api/v1/organizations/{org-id}/members \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "email": "test@example.com",
    "role": "VIEWER",
    "stellarPublicKey": "GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCD"
  }'
```

#### Create Invitation
```bash
curl -X POST http://localhost:3001/api/v1/organizations/{org-id}/invitations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "email": "invite@example.com",
    "role": "BILLING_MANAGER",
    "message": "Welcome to our team!"
  }'
```

#### Member Login
```bash
curl -X POST http://localhost:3001/api/v1/auth/member/login \
  -H "Content-Type: application/json" \
  -d '{
    "stellarPublicKey": "GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCD",
    "organizationSlug": "test-org"
  }'
```

## Monitoring and Health Checks

### Health Endpoint
```bash
curl http://localhost:3001/health
```

### Rate Limiting Metrics
```bash
curl http://localhost:3001/api/v1/admin/rate-limit/metrics \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

## Security Considerations

### 1. Database Security
- Ensure database connections use SSL
- Implement proper database user permissions
- Regular database backups

### 2. API Security
- Use HTTPS in production
- Implement rate limiting
- Monitor for suspicious activity

### 3. Key Management
- Store Stellar private keys securely
- Rotate keys regularly
- Use hardware security modules for production

## Troubleshooting

### Common Issues

#### Migration Failures
```bash
# Check migration status
npm run migrate:status

# Rollback if needed
npm run migrate:rollback
```

#### Authentication Issues
- Verify Stellar public key format (56 characters)
- Check JWT token expiration
- Ensure proper environment variables

#### Permission Errors
- Verify member status is ACTIVE
- Check role permissions
- Ensure tenant_id matches organization

#### Database Connection Issues
- Verify DATABASE_URL format
- Check database server status
- Ensure proper network connectivity

### Log Analysis
```bash
# View application logs
tail -f logs/app.log

# View error logs
tail -f logs/error.log
```

## Performance Optimization

### Database Indexes
The migrations include optimized indexes for:
- Organization lookups by slug
- Member searches by email and Stellar public key
- Tenant-based queries
- Invitation token lookups

### Caching Strategy
- Redis for session management
- JWT token caching for revoked tokens
- Organization data caching

### Connection Pooling
Configure database connection pool in `knexfile.js`:
```javascript
module.exports = {
  production: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 100
    }
  }
};
```

## Scaling Considerations

### Horizontal Scaling
- Use load balancers for multiple API instances
- Implement session affinity for WebSocket connections
- Consider read replicas for database scaling

### Vertical Scaling
- Monitor memory usage for large organizations
- Optimize database queries for high member counts
- Implement pagination for member lists

## Backup and Recovery

### Database Backup
```bash
# Full backup
pg_dump stellar_privacy > backup_$(date +%Y%m%d_%H%M%S).sql

# Incremental backup (if using WAL)
pg_basebackup -D /backup/base -Ft -z -P
```

### Application State Backup
- Backup Redis data regularly
- Export organization configurations
- Document custom role configurations

## Compliance and Auditing

### Audit Trail
All sensitive operations are logged:
- Member authentication events
- Organization changes
- Permission modifications
- Data access attempts

### Data Retention
- Configure log retention policies
- Implement data purging for deleted organizations
- Maintain audit logs for compliance periods

## Next Steps

1. **Frontend Integration**: Update frontend to use new organization-based authentication
2. **SSO Integration**: Implement SAML/OIDC for enterprise customers
3. **Advanced Features**: Add custom roles and resource-level permissions
4. **Monitoring**: Set up comprehensive monitoring and alerting
5. **Documentation**: Create user guides for organization administrators

## Support

For deployment issues:
1. Check the troubleshooting section
2. Review application logs
3. Verify environment configuration
4. Test database connectivity
5. Validate JWT token generation
