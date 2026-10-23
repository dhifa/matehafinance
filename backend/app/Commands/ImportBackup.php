<?php

namespace App\Commands;

use App\Libraries\BackupImporter;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;
use Throwable;

/**
 * php spark mateha:import-backup <file.json> [--overwrite]
 *
 * Imports the "Download Full Database (.JSON)" backup into MySQL (see
 * BackupImporter). The same import is available to admins on the dashboard.
 */
class ImportBackup extends BaseCommand
{
    protected $group       = 'Mateha';
    protected $name        = 'mateha:import-backup';
    protected $description = 'Import a Firestore JSON backup into MySQL.';
    protected $usage       = 'mateha:import-backup <file.json> [--overwrite]';
    protected $arguments   = ['file' => 'Path to mateha_full_backup_YYYY-MM-DD.json'];
    protected $options     = ['--overwrite' => 'Replace documents that already exist (default: skip them)'];

    public function run(array $params)
    {
        $file = $params[0] ?? null;
        if (! $file || ! is_file($file)) {
            CLI::error('File backup tidak ditemukan. Contoh: php spark mateha:import-backup /path/mateha_full_backup.json');

            return EXIT_ERROR;
        }

        $backup = json_decode((string) file_get_contents($file), true);
        if (! is_array($backup)) {
            CLI::error('Format file tidak dikenali (harus file backup JSON dari menu Dashboard > Backup & Export).');

            return EXIT_ERROR;
        }

        try {
            $result = BackupImporter::import($backup, CLI::getOption('overwrite') !== null);
        } catch (Throwable $e) {
            CLI::error($e->getMessage());

            return EXIT_ERROR;
        }

        foreach ($result['notes'] as $note) {
            CLI::write("- {$note}", 'yellow');
        }
        CLI::table(array_map(static fn ($r) => array_values($r), $result['rows']), ['Koleksi', 'Diimpor', 'Dilewati']);

        if (! $result['hasFinance']) {
            CLI::write('Catatan: backup ini tidak berisi data Keuangan Mateha (settings/mateha_finance).', 'yellow');
        }
        if ($result['noLogin'] !== []) {
            CLI::write('Akun tanpa password di backup (set dengan "php spark mateha:create-user <username>"): ' . implode(', ', $result['noLogin']), 'yellow');
        }
        CLI::write('Impor selesai.', 'green');

        return EXIT_SUCCESS;
    }
}
