import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add organization_id to merchants table
  await knex.schema.alterTable('merchants', (table: any) => {
    table.uuid('organization_id').nullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('owner_member_id').nullable().references('id').inTable('members').onDelete('SET NULL');
    
    // Add indexes
    table.index('organization_id');
    table.index('owner_member_id');
  });

  // Add tenant_id column for multi-tenancy support
  await knex.schema.alterTable('merchants', (table: any) => {
    table.string('tenant_id').notNullable().defaultTo(knex.raw('id::text')); // Default to merchant ID for backward compatibility
    table.index('tenant_id');
  });

  // Add tenant_id to related tables for proper isolation
  await knex.schema.alterTable('merchant_balances', (table: any) => {
    table.string('tenant_id').notNullable();
    table.index('tenant_id');
  });

  await knex.schema.alterTable('treasury_snapshots', (table: any) => {
    table.string('tenant_id').notNullable();
    table.index('tenant_id');
  });

  // Update existing merchants to have tenant_id matching their ID
  await knex('merchants').update({
    tenant_id: knex.raw('id::text')
  });

  // Update merchant_balances to have tenant_id from merchants
  await knex('merchant_balances')
    .update('tenant_id', knex.raw('(SELECT tenant_id FROM merchants WHERE id = merchant_balances.merchant_id)'));

  // Update treasury_snapshots to have tenant_id from merchants
  await knex('treasury_snapshots')
    .update('tenant_id', knex.raw('(SELECT tenant_id FROM merchants WHERE id = treasury_snapshots.merchant_id)'));
}

export async function down(knex: Knex): Promise<void> {
  // Remove tenant_id columns
  await knex.schema.alterTable('treasury_snapshots', (table: any) => {
    table.dropColumn('tenant_id');
  });

  await knex.schema.alterTable('merchant_balances', (table: any) => {
    table.dropColumn('tenant_id');
  });

  await knex.schema.alterTable('merchants', (table: any) => {
    table.dropColumn('tenant_id');
    table.dropColumn('owner_member_id');
    table.dropColumn('organization_id');
  });
}
