<?php

namespace App\Commands;

use App\Libraries\DocumentStore;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;
use Config\Mateha;

/**
 * php spark mateha:create-user <username> [--role admin] [--name "Display Name"]
 * Creates a login account (or resets the password of an existing one).
 */
class CreateUser extends BaseCommand
{
    protected $group       = 'Mateha';
    protected $name        = 'mateha:create-user';
    protected $description = 'Create a user account or reset its password.';
    protected $usage       = 'mateha:create-user <username> [options]';
    protected $arguments   = ['username' => 'Login username (without @mateha.local)'];
    protected $options     = [
        '--role'     => 'admin, finance or staff (default: admin for new accounts)',
        '--name'     => 'Display name',
        '--password' => 'Password (prompted when omitted)',
    ];

    public function run(array $params)
    {
        $username = strtolower(trim((string) ($params[0] ?? CLI::prompt('Username', null, 'required'))));
        if (! preg_match('/^[a-z0-9_.\-]+$/', $username)) {
            CLI::error('Username hanya boleh huruf kecil, angka, titik, garis bawah atau strip.');

            return EXIT_ERROR;
        }

        $password = (string) (CLI::getOption('password') ?? '');
        if ($password === '') {
            $password = CLI::prompt('Password (min. 6 karakter)', null, 'required');
        }
        if (mb_strlen($password) < 6) {
            CLI::error('Password minimal 6 karakter.');

            return EXIT_ERROR;
        }

        $store    = new DocumentStore();
        $existing = db_connect()->table('users')->where('username', $username)->get()->getRowArray();
        $hash     = ['password_hash' => password_hash($password, PASSWORD_DEFAULT)];

        if ($existing) {
            $changes = [];
            if (CLI::getOption('role')) {
                $changes['role'] = strtolower((string) CLI::getOption('role'));
            }
            if (CLI::getOption('name')) {
                $changes['displayName'] = (string) CLI::getOption('name');
            }
            $store->update('users', $existing['id'], $changes, $hash);
            CLI::write("Password akun \"{$username}\" diperbarui.", 'green');

            return EXIT_SUCCESS;
        }

        $uid    = DocumentStore::newId();
        $domain = config(Mateha::class)->localEmailDomain;
        $store->set('users', $uid, [
            'uid'         => $uid,
            'username'    => $username,
            'displayName' => (string) (CLI::getOption('name') ?: $username),
            'email'       => "{$username}@{$domain}",
            'role'        => strtolower((string) (CLI::getOption('role') ?: 'admin')),
            'status'      => 'aktif',
            'createdAt'   => date('c'),
        ], false, $hash);

        CLI::write("Akun \"{$username}\" dibuat (uid {$uid}).", 'green');

        return EXIT_SUCCESS;
    }
}
