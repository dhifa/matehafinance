<?php

namespace App\Libraries;

use Config\Mateha;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

/**
 * Imports the "Download Full Database (.JSON)" backup (from the Firestore
 * version of the app, or from this one) into MySQL. Used by the
 * `mateha:import-backup` command and the admin import on the dashboard.
 *
 * Plaintext passwords found in user documents are hashed so staff can keep
 * logging in with the same password.
 */
class BackupImporter
{
    /**
     * @return array{
     *     rows: list<array{collection: string, imported: int, skipped: int}>,
     *     notes: list<string>,
     *     noLogin: list<string>,
     *     hasFinance: bool
     * }
     */
    public static function import(array $backup, bool $overwrite): array
    {
        if (! isset($backup['collections']) || ! is_array($backup['collections'])) {
            throw new InvalidArgumentException('Format file tidak dikenali (harus file backup JSON dari menu Dashboard > Backup & Export).');
        }

        $store   = new DocumentStore();
        $db      = db_connect();
        $domain  = config(Mateha::class)->localEmailDomain;
        $rows    = [];
        $notes   = [];
        $noLogin = [];

        $db->transStart();

        foreach ($backup['collections'] as $collection => $items) {
            $collection = (string) $collection;
            if (! $store->hasCollection($collection) || ! is_array($items)) {
                $notes[] = "Koleksi tidak dikenal dilewati: {$collection}";

                continue;
            }

            $imported = $skipped = 0;
            foreach ($items as $item) {
                if (! is_array($item)) {
                    $skipped++;

                    continue;
                }
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
                    unset($item['password'], $item['password_hash']);
                    if (is_string($plain) && $plain !== '') {
                        $extra['password_hash'] = password_hash($plain, PASSWORD_DEFAULT);
                    } elseif ($store->get('users', $id) === null) {
                        $noLogin[] = $item['username'];
                    }

                    $clash = $db->table('users')->where('username', $item['username'])->where('id !=', $id)->countAllResults();
                    if ($clash > 0) {
                        $notes[] = "Username \"{$item['username']}\" sudah dipakai akun lain, dokumen {$id} dilewati.";
                        $skipped++;

                        continue;
                    }
                }

                $store->set($collection, $id, $item, false, $extra);
                $imported++;
            }

            $rows[] = ['collection' => $collection, 'imported' => $imported, 'skipped' => $skipped];
        }

        foreach (is_array($backup['settings'] ?? null) ? $backup['settings'] : [] as $settingId => $data) {
            $settingId = (string) $settingId;
            try {
                DocumentStore::assertValidId($settingId);
            } catch (Throwable) {
                continue;
            }
            if (! is_array($data)) {
                continue;
            }
            $isNew = $store->get('settings', $settingId) === null;
            if ($overwrite || $isNew) {
                $store->set('settings', $settingId, $data);
            }
            $rows[] = ['collection' => "settings/{$settingId}", 'imported' => $overwrite || $isNew ? 1 : 0, 'skipped' => $overwrite || $isNew ? 0 : 1];
        }

        $db->transComplete();
        if (! $db->transStatus()) {
            throw new RuntimeException('Impor gagal, semua perubahan dibatalkan.');
        }

        return [
            'rows'       => $rows,
            'notes'      => $notes,
            'noLogin'    => array_values(array_unique($noLogin)),
            'hasFinance' => isset($backup['settings']['mateha_finance']),
        ];
    }
}
