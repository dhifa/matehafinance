<?php

namespace App\Libraries;

/**
 * Builds a MySQL dump (structure + data) of the app's database, restorable
 * with phpMyAdmin "Import" or `mysql nama_database < file.sql`.
 *
 * Login sessions (auth_tokens) and secrets (app_secrets: the Gemini API key)
 * are left out on purpose.
 */
class SqlExporter
{
    public const EXCLUDED_TABLES = ['auth_tokens', 'app_secrets'];
    private const ROWS_PER_INSERT = 100;

    /**
     * @return array{sql: string, tables: array<string, int>}
     */
    public static function dump(): array
    {
        $db     = db_connect();
        $tables = array_values(array_filter($db->listTables(), static fn ($t) => ! in_array($t, self::EXCLUDED_TABLES, true)));
        sort($tables);

        $out = [
            '-- Mateha Finance: export database MySQL',
            '-- Dibuat: ' . date('Y-m-d H:i:s') . ' | database: ' . $db->getDatabase(),
            '-- Tidak termasuk: ' . implode(', ', self::EXCLUDED_TABLES) . ' (sesi login dan API key)',
            '',
            'SET NAMES utf8mb4;',
            'SET FOREIGN_KEY_CHECKS = 0;',
            "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';",
            '',
        ];
        $counts = [];

        foreach ($tables as $table) {
            $quoted = $db->escapeIdentifiers($table);
            $create = $db->query("SHOW CREATE TABLE {$quoted}")->getRowArray();
            $out[]  = "-- --------------------------------------------------------\n-- Tabel {$table}";
            $out[]  = "DROP TABLE IF EXISTS {$quoted};";
            $out[]  = ($create['Create Table'] ?? '') . ';';
            $out[]  = '';

            $rows           = $db->table($table)->get()->getResultArray();
            $counts[$table] = count($rows);
            if ($rows === []) {
                continue;
            }

            $columns = '(' . implode(', ', array_map(static fn ($c) => $db->escapeIdentifiers($c), array_keys($rows[0]))) . ')';
            foreach (array_chunk($rows, self::ROWS_PER_INSERT) as $chunk) {
                $values = array_map(static function (array $row) use ($db): string {
                    return '(' . implode(', ', array_map(static fn ($v) => $v === null ? 'NULL' : $db->escape((string) $v), $row)) . ')';
                }, $chunk);
                $out[] = "INSERT INTO {$quoted} {$columns} VALUES\n" . implode(",\n", $values) . ';';
            }
            $out[] = '';
        }

        $out[] = 'SET FOREIGN_KEY_CHECKS = 1;';

        return ['sql' => implode("\n", $out) . "\n", 'tables' => $counts];
    }
}
