<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Long-term rules and preferences the AI assistant should remember
 * (e.g. "kalau klien minta streaming, selalu tambahkan 1 operator zoom").
 */
class CreateAiMemories extends Migration
{
    public function up(): void
    {
        $this->forge->addField([
            'id'         => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'content'    => ['type' => 'TEXT'],
            'active'     => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'source'     => ['type' => 'VARCHAR', 'constraint' => 16, 'default' => 'chat'],
            'created_by' => ['type' => 'VARCHAR', 'constraint' => 128, 'null' => true],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->addKey('active');
        $this->forge->createTable('ai_memories', true, ['ENGINE' => 'InnoDB', 'DEFAULT CHARSET' => 'utf8mb4', 'COLLATE' => 'utf8mb4_unicode_ci']);
    }

    public function down(): void
    {
        $this->forge->dropTable('ai_memories', true);
    }
}
