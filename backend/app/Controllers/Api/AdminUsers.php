<?php

namespace App\Controllers\Api;

use App\Libraries\Auth;
use App\Libraries\DocumentStore;
use CodeIgniter\HTTP\ResponseInterface;
use Config\Mateha;

class AdminUsers extends BaseApiController
{
    /**
     * POST /api/admin/users {email, password}
     * Creates the login account for a new team member and returns its uid. The
     * frontend then writes the full profile to users/{uid} through the collections API.
     */
    public function create(): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }

        $body     = $this->body();
        $email    = strtolower(trim((string) ($body['email'] ?? '')));
        $password = (string) ($body['password'] ?? '');
        $domain   = config(Mateha::class)->localEmailDomain;

        $username = str_contains($email, '@') ? explode('@', $email)[0] : $email;
        $username = preg_replace('/[^a-z0-9_.\-]/', '', $username);

        if ($username === '' || mb_strlen($password) < 6) {
            return $this->fail(400, 'invalid-argument', 'Username wajib diisi dan password minimal 6 karakter.');
        }

        $db = db_connect();
        if ($db->table('users')->where('username', $username)->countAllResults() > 0) {
            return $this->fail(409, 'email-already-in-use', "Username \"{$username}\" sudah terdaftar. Gunakan username lain atau ubah anggota yang sudah ada.");
        }

        $uid  = DocumentStore::newId();
        $mail = str_ends_with($email, '@' . $domain) || ! str_contains($email, '@') ? "{$username}@{$domain}" : $email;

        (new DocumentStore())->set('users', $uid, [
            'uid'       => $uid,
            'username'  => $username,
            'email'     => $mail,
            'role'      => 'staff',
            'status'    => 'aktif',
            'createdAt' => date('c'),
        ], false, ['password_hash' => password_hash($password, PASSWORD_DEFAULT)]);

        return $this->ok(['uid' => $uid, 'isExistingAuth' => false]);
    }
}
