import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('members', (table: any) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('email').notNullable();
    table.string('stellar_public_key').nullable(); // User's Stellar pubkey for authentication
    table.enum('role', ['ADMIN', 'VIEWER', 'BILLING_MANAGER']).notNullable().defaultTo('VIEWER');
    table.string('status').notNullable().defaultTo('PENDING'); // PENDING, ACTIVE, INACTIVE
    table.uuid('invited_by').nullable().references('id').inTable('members');
    table.timestamp('invited_at').nullable();
    table.timestamp('joined_at').nullable();
    table.timestamp('last_login_at').nullable();
    table.boolean('email_verified').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Constraints
    table.unique(['organization_id', 'email']);
    table.unique(['organization_id', 'stellar_public_key']);
    
    // Indexes
    table.index('organization_id');
    table.index('email');
    table.index('stellar_public_key');
    table.index('role');
    table.index('status');
    table.index('invited_by');
    table.index('created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('members');
}
