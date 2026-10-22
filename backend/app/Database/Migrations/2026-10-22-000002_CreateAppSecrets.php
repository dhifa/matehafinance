<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Server-only settings (e.g. the Gemini API key). Unlike the `settings`
 * collection, this table is never exposed through the collections API.
 */
class CreateAppSecrets extends Migration
{
    public function up(): void
    {
        $this->forge->addField([
            'name'       => ['type' => 'VARCHAR', 'constraint' => 64],
            'value'      => ['type' => 'TEXT'],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_by' => ['type' => 'VARCHAR', 'constraint' => 128, 'null' => true],
        ]);
        $this->forge->addPrimaryKey('name');
        $this->forge->createTable('app_secrets', true, ['ENGINE' => 'InnoDB', 'DEFAULT CHARSET' => 'utf8mb4']);
    }

    public function down(): void
    {
        $this->forge->dropTable('app_secrets', true);
    }
}
