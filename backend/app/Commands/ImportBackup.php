<?php

namespace App\Commands;

use App\Libraries\DocumentStore;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;
use Config\Mateha;
use Throwable;

/**
 * php spark mateha:import-backup <file.json> [--overwrite]
 *
 * Imports the "Download Full Database (.JSON)" file produced by the former
 * Firestore version of the app into MySQL. Plaintext passwords found in user
 * documents are hashed so staff can keep logging in with the same password.
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
        if (! is_array($backup) || ! isset($backup['collections']) || ! is_array($backup['collections'])) {
            CLI::error('Format file tidak dikenali (harus file backup JSON dari menu Dashboard > Backup & Export).');

            return EXIT_ERROR;
        }

        $overwrite = CLI::getOption('overwrite') !== null;
        $store     = new DocumentStore();
        $db        = db_connect();
        $domain    = config(Mateha::class)->localEmailDomain;
        $noLogin   = [];
        $rows      = [];

        $db->transStart();

        foreach ($backup['collections'] as $collection => $items) {
            if (! $store->hasCollection($collection) || ! is_array($items)) {
                CLI::write("- Lewati koleksi tidak dikenal: {$collection}", 'yellow');

                continue;
            }

            $imported = $skipped = 0;
            foreach ($items as $item) {
                $id = (string) ($item['id'] ?? $item['uid'] ?? '');
                try {
                    DocumentStore::assertValidId($id);
                } catch (Throwable) {
                    $skipped++;

                    continue;
                }

                if (! $overwrite && $store->get($collection, $id) !== null) {
                    $skipped++;

                    continue;
                }

                $extra = [];
                if ($collection === 'users') {
                    $item['uid']      = $id;
                    $item['username'] = strtolower(trim((string) ($item['username'] ?? '')));
                    if ($item['username'] === '') {
                        $item['username'] = strtolower(explode('@', (string) ($item['email'] ?? $id))[0]);
                    }
                    $item['email'] ??= "{$item['username']}@{$domain}";

                    $plain = $item['password'] ?? null;
                    unset($item['password']);
                    if (is_string($plain) && $plain !== '') {
                        $extra['password_hash'] = password_hash($plain, PASSWORD_DEFAULT);
                    } else {
                        $noLogin[] = $item['username'];
                    }

                    $clash = $db->table('users')->where('username', $item['username'])->where('id !=', $id)->countAllResults();
                    if ($clash > 0) {
                        CLI::write("  ! Username \"{$item['username']}\" sudah dipakai akun lain, dokumen {$id} dilewati.", 'yellow');
                        $skipped++;

                        continue;
                    }
                }

                $store->set($collection, $id, $item, false, $extra);
                $imported++;
            }

            $rows[] = [$collection, $imported, $skipped];
        }

        foreach (($backup['settings'] ?? []) as $settingId => $data) {
            if (! is_array($data)) {
                continue;
            }
            if ($overwrite || $store->get('settings', (string) $settingId) === null) {
                $store->set('settings', (string) $settingId, $data);
                $rows[] = ["settings/{$settingId}", 1, 0];
            } else {
                $rows[] = ["settings/{$settingId}", 0, 1];
            }
        }

        $db->transComplete();
        if (! $db->transStatus()) {
            CLI::error('Impor gagal, semua perubahan dibatalkan.');

            return EXIT_ERROR;
        }

        CLI::table($rows, ['Koleksi', 'Diimpor', 'Dilewati']);

        if (! isset($backup['settings']['mateha_finance'])) {
            CLI::write('Catatan: backup ini tidak berisi data Keuangan Mateha (settings/mateha_finance).', 'yellow');
        }
        if ($noLogin !== []) {
            CLI::write('Akun tanpa password di backup (set dengan "php spark mateha:create-user <username>"): ' . implode(', ', array_unique($noLogin)), 'yellow');
        }
        CLI::write('Impor selesai.', 'green');

        return EXIT_SUCCESS;
    }
}
