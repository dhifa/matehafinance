<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;
use Config\Mateha;

class CreateMatehaTables extends Migration
{
    public function up(): void
    {
        $config = config(Mateha::class);

        foreach ($config->collections as $collection => $def) {
            $fields = [
                'id'         => ['type' => 'VARCHAR', 'constraint' => 128],
                'data'       => ['type' => 'LONGTEXT'],
                'created_at' => ['type' => 'DATETIME', 'null' => true],
                'updated_at' => ['type' => 'DATETIME', 'null' => true],
            ];

            foreach ($def['indexes'] as $column) {
                $fields[$column] = $column === 'is_public'
                    ? ['type' => 'TINYINT', 'constraint' => 1, 'default' => 0]
                    : ['type' => 'VARCHAR', 'constraint' => 191, 'null' => true];
            }

            if ($collection === 'users') {
                $fields['password_hash'] = ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true];
            }

            $this->forge->addField($fields);
            $this->forge->addPrimaryKey('id');

            foreach ($def['indexes'] as $column) {
                if ($collection === 'users' && $column === 'username') {
                    $this->forge->addUniqueKey('username');
                } else {
                    $this->forge->addKey($column);
                }
            }

            $this->forge->createTable($def['table'], true, ['ENGINE' => 'InnoDB', 'DEFAULT CHARSET' => 'utf8mb4', 'COLLATE' => 'utf8mb4_unicode_ci']);
        }

        $this->forge->addField([
            'id'           => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'user_id'      => ['type' => 'VARCHAR', 'constraint' => 128],
            'token_hash'   => ['type' => 'CHAR', 'constraint' => 64],
            'created_at'   => ['type' => 'DATETIME'],
            'last_used_at' => ['type' => 'DATETIME', 'null' => true],
            'expires_at'   => ['type' => 'DATETIME'],
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->addUniqueKey('token_hash');
        $this->forge->addKey('user_id');
        $this->forge->createTable('auth_tokens', true, ['ENGINE' => 'InnoDB', 'DEFAULT CHARSET' => 'utf8mb4']);
    }

    public function down(): void
    {
        $this->forge->dropTable('auth_tokens', true);
        foreach (config(Mateha::class)->collections as $def) {
            $this->forge->dropTable($def['table'], true);
        }
    }
}
