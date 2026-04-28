import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('invitations', (table: any) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('invited_by').notNullable().references('id').inTable('members');
    table.string('email').notNullable();
    table.enum('role', ['ADMIN', 'VIEWER', 'BILLING_MANAGER']).notNullable().defaultTo('VIEWER');
    table.string('token').notNullable().unique(); // Invitation token for email verification
    table.string('status').notNullable().defaultTo('PENDING'); // PENDING, ACCEPTED, EXPIRED, CANCELLED
    table.timestamp('expires_at').notNullable();
    table.timestamp('accepted_at').nullable();
    table.text('message').nullable(); // Personal invitation message
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('organization_id');
    table.index('invited_by');
    table.index('email');
    table.index('token');
    table.index('status');
    table.index('expires_at');
    table.index('created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('invitations');
}
