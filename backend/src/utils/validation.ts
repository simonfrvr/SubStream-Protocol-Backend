import { body, param, query, ValidationChain } from 'express-validator';

// Organization validation chains
export const createOrganizationValidation: ValidationChain[] = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-\.]+$/)
    .withMessage('Name can only contain letters, numbers, spaces, hyphens, and periods'),
  
  body('slug')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Slug must be between 2 and 50 characters')
    .matches(/^[a-z0-9\-]+$/)
    .withMessage('Slug must contain only lowercase letters, numbers, and hyphens'),
  
  body('domain')
    .optional()
    .isEmail()
    .withMessage('Domain must be a valid email address'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters')
];

export const updateOrganizationValidation: ValidationChain[] = [
  param('id').isUUID().withMessage('Invalid organization ID'),
  
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-\.]+$/)
    .withMessage('Name can only contain letters, numbers, spaces, hyphens, and periods'),
  
  body('domain')
    .optional()
    .isEmail()
    .withMessage('Domain must be a valid email address'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  
  body('active')
    .optional()
    .isBoolean()
    .withMessage('Active must be a boolean')
];

// Member validation chains
export const createMemberValidation: ValidationChain[] = [
  param('id').isUUID().withMessage('Invalid organization ID'),
  
  body('email')
    .isEmail()
    .withMessage('Valid email address required')
    .normalizeEmail(),
  
  body('role')
    .isIn(['ADMIN', 'VIEWER', 'BILLING_MANAGER'])
    .withMessage('Role must be ADMIN, VIEWER, or BILLING_MANAGER'),
  
  body('stellarPublicKey')
    .optional()
    .isLength({ min: 56, max: 56 })
    .matches(/^G[A-Z0-9]{55}$/)
    .withMessage('Stellar public key must be 56 characters starting with G')
];

export const updateMemberValidation: ValidationChain[] = [
  param('id').isUUID().withMessage('Invalid organization ID'),
  param('memberId').isUUID().withMessage('Invalid member ID'),
  
  body('role')
    .optional()
    .isIn(['ADMIN', 'VIEWER', 'BILLING_MANAGER'])
    .withMessage('Role must be ADMIN, VIEWER, or BILLING_MANAGER'),
  
  body('status')
    .optional()
    .isIn(['PENDING', 'ACTIVE', 'INACTIVE'])
    .withMessage('Status must be PENDING, ACTIVE, or INACTIVE')
];

// Invitation validation chains
export const createInvitationValidation: ValidationChain[] = [
  param('id').isUUID().withMessage('Invalid organization ID'),
  
  body('email')
    .isEmail()
    .withMessage('Valid email address required')
    .normalizeEmail(),
  
  body('role')
    .isIn(['ADMIN', 'VIEWER', 'BILLING_MANAGER'])
    .withMessage('Role must be ADMIN, VIEWER, or BILLING_MANAGER'),
  
  body('message')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Message must be less than 500 characters'),
  
  body('expiresInDays')
    .optional()
    .isInt({ min: 1, max: 30 })
    .withMessage('Expires in days must be between 1 and 30')
];

export const acceptInvitationValidation: ValidationChain[] = [
  param('token')
    .isLength({ min: 32 })
    .withMessage('Invalid invitation token'),
  
  body('stellarPublicKey')
    .isLength({ min: 56, max: 56 })
    .matches(/^G[A-Z0-9]{55}$/)
    .withMessage('Stellar public key must be 56 characters starting with G')
];

// Authentication validation chains
export const memberLoginValidation: ValidationChain[] = [
  body('stellarPublicKey')
    .isLength({ min: 56, max: 56 })
    .matches(/^G[A-Z0-9]{55}$/)
    .withMessage('Stellar public key must be 56 characters starting with G'),
  
  body('organizationSlug')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .matches(/^[a-z0-9\-]+$/)
    .withMessage('Organization slug must contain only lowercase letters, numbers, and hyphens'),
  
  body('signature')
    .optional()
    .isLength({ min: 128, max: 128 })
    .matches(/^[a-fA-F0-9]+$/)
    .withMessage('Signature must be 128 hexadecimal characters')
];

export const verifyStellarSignatureValidation: ValidationChain[] = [
  body('publicKey')
    .isLength({ min: 56, max: 56 })
    .matches(/^G[A-Z0-9]{55}$/)
    .withMessage('Stellar public key must be 56 characters starting with G'),
  
  body('signature')
    .isLength({ min: 128, max: 128 })
    .matches(/^[a-fA-F0-9]+$/)
    .withMessage('Signature must be 128 hexadecimal characters'),
  
  body('message')
    .isString()
    .withMessage('Message is required')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message must be between 1 and 1000 characters')
];

// Enhanced merchant validation chains
export const createEnhancedMerchantValidation: ValidationChain[] = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-\.]+$/)
    .withMessage('Name can only contain letters, numbers, spaces, hyphens, and periods'),
  
  body('baseCurrency')
    .isIn(['USD', 'EUR', 'GBP'])
    .withMessage('Base currency must be USD, EUR, or GBP'),
  
  body('ownerMemberId')
    .optional()
    .isUUID()
    .withMessage('Owner member ID must be a valid UUID')
];

export const updateEnhancedMerchantValidation: ValidationChain[] = [
  param('id').isUUID().withMessage('Invalid merchant ID'),
  
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-\.]+$/)
    .withMessage('Name can only contain letters, numbers, spaces, hyphens, and periods'),
  
  body('baseCurrency')
    .optional()
    .isIn(['USD', 'EUR', 'GBP'])
    .withMessage('Base currency must be USD, EUR, or GBP'),
  
  body('ownerMemberId')
    .optional()
    .isUUID()
    .withMessage('Owner member ID must be a valid UUID')
];

export const transferMerchantValidation: ValidationChain[] = [
  param('id').isUUID().withMessage('Invalid merchant ID'),
  
  body('targetOrganizationId')
    .isUUID()
    .withMessage('Target organization ID must be a valid UUID'),
  
  body('targetTenantId')
    .isString()
    .withMessage('Target tenant ID is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Target tenant ID must be between 1 and 100 characters')
];

// Common validation chains
export const uuidParamValidation = (paramName: string): ValidationChain => 
  param(paramName).isUUID().withMessage(`Invalid ${paramName}`);

export const paginationValidation: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('sortBy')
    .optional()
    .isIn(['name', 'createdAt', 'updatedAt', 'email', 'role'])
    .withMessage('Invalid sort field'),
  
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
];

// Custom validators
export const stellarPublicKeyValidator = (value: string): boolean => {
  return /^G[A-Z0-9]{55}$/.test(value);
};

export const organizationSlugValidator = (value: string): boolean => {
  return /^[a-z0-9\-]+$/.test(value) && value.length >= 2 && value.length <= 50;
};

export const emailValidator = (value: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
};

// Sanitization functions
export const sanitizeOrganizationName = (name: string): string => {
  return name.trim().replace(/[^\w\s\-\.]/g, '');
};

export const sanitizeSlug = (slug: string): string => {
  return slug.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-');
};

export const sanitizeEmail = (email: string): string => {
  return email.toLowerCase().trim();
};

// Error message constants
export const VALIDATION_ERROR_MESSAGES = {
  INVALID_UUID: 'Invalid UUID format',
  INVALID_EMAIL: 'Invalid email address',
  INVALID_STELLAR_PUBKEY: 'Stellar public key must be 56 characters starting with G',
  INVALID_ORG_SLUG: 'Organization slug must contain only lowercase letters, numbers, and hyphens',
  INVALID_ROLE: 'Role must be ADMIN, VIEWER, or BILLING_MANAGER',
  INVALID_STATUS: 'Status must be PENDING, ACTIVE, or INACTIVE',
  INVALID_CURRENCY: 'Base currency must be USD, EUR, or GBP',
  INVALID_SIGNATURE: 'Signature must be 128 hexadecimal characters',
  NAME_LENGTH: 'Name must be between 2 and 100 characters',
  SLUG_LENGTH: 'Slug must be between 2 and 50 characters',
  MESSAGE_LENGTH: 'Message must be less than 500 characters',
  DESCRIPTION_LENGTH: 'Description must be less than 500 characters',
  EXPIRATION_DAYS: 'Expires in days must be between 1 and 30',
  PAGE_LIMIT: 'Page must be a positive integer',
  LIMIT_RANGE: 'Limit must be between 1 and 100'
} as const;

// Validation result formatter
export const formatValidationErrors = (errors: any[]): any[] => {
  return errors.map(error => ({
    field: error.path || error.param,
    message: error.msg,
    value: error.value,
    location: error.location
  }));
};
