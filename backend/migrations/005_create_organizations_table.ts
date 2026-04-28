import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('organizations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('slug').notNullable().unique(); // URL-friendly identifier
    table.string('domain').nullable(); // Optional company domain for SSO
    table.text('description').nullable();
    table.uuid('created_by').notNullable(); // User who created the organization
    table.boolean('active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('slug');
    table.index('created_by');
    table.index('active');
    table.index('created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('organizations');
}
