<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * WhatsApp blasts: per-payslip send status, login-protected payslip links and
 * a send log. None of these tables hold salary amounts.
 */
class CreateWhatsAppTables extends Migration
{
    private const TABLE_OPTIONS = ['ENGINE' => 'InnoDB', 'DEFAULT CHARSET' => 'utf8mb4', 'COLLATE' => 'utf8mb4_unicode_ci'];

    public function up(): void
    {
        $this->forge->addField([
            'payslip_id' => ['type' => 'VARCHAR', 'constraint' => 191],
            'status'     => ['type' => 'VARCHAR', 'constraint' => 16],
            'reason'     => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'month'      => ['type' => 'TINYINT', 'unsigned' => true],
            'year'       => ['type' => 'SMALLINT', 'unsigned' => true],
            'uid'        => ['type' => 'VARCHAR', 'constraint' => 128, 'null' => true],
            'sent_by'    => ['type' => 'VARCHAR', 'constraint' => 191, 'null' => true],
            'at'         => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addPrimaryKey('payslip_id');
        $this->forge->createTable('wa_payslip_status', true, self::TABLE_OPTIONS);

        $this->forge->addField([
            'token'      => ['type' => 'VARCHAR', 'constraint' => 64],
            'uid'        => ['type' => 'VARCHAR', 'constraint' => 128],
            'username'   => ['type' => 'VARCHAR', 'constraint' => 128],
            'payslip_id' => ['type' => 'VARCHAR', 'constraint' => 191],
            'month'      => ['type' => 'TINYINT', 'unsigned' => true],
            'year'       => ['type' => 'SMALLINT', 'unsigned' => true],
            'created_at' => ['type' => 'DATETIME'],
            'expires_at' => ['type' => 'DATETIME'],
        ]);
        $this->forge->addPrimaryKey('token');
        $this->forge->addKey('expires_at');
        $this->forge->createTable('payslip_links', true, self::TABLE_OPTIONS);

        $this->forge->addField([
            'id'         => ['type' => 'INT', 'unsigned' => true, 'auto_increment' => true],
            'at'         => ['type' => 'DATETIME'],
            'kind'       => ['type' => 'VARCHAR', 'constraint' => 32],
            'ref'        => ['type' => 'VARCHAR', 'constraint' => 255],
            'staff_uid'  => ['type' => 'VARCHAR', 'constraint' => 128, 'null' => true],
            'staff_name' => ['type' => 'VARCHAR', 'constraint' => 191],
            'status'     => ['type' => 'VARCHAR', 'constraint' => 16],
            'reason'     => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'sent_by'    => ['type' => 'VARCHAR', 'constraint' => 191],
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->addKey('at');
        $this->forge->createTable('wa_logs', true, self::TABLE_OPTIONS);
    }

    public function down(): void
    {
        $this->forge->dropTable('wa_logs', true);
        $this->forge->dropTable('payslip_links', true);
        $this->forge->dropTable('wa_payslip_status', true);
    }
}
