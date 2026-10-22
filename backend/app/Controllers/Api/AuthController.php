<?php

namespace App\Controllers\Api;

use App\Libraries\Auth;
use App\Libraries\DocumentStore;
use App\Libraries\Policy;
use CodeIgniter\HTTP\ResponseInterface;
use Config\Mateha;

class AuthController extends BaseApiController
{
    /**
     * POST /api/auth/login {email, password}
     * "email" may also be a bare username or username@mateha.local, like the old login screen sent.
     */
    public function login(): ResponseInterface
    {
        $config = config(Mateha::class);
        $ipKey  = 'login-' . md5((string) $this->request->getIPAddress());
        if (service('throttler')->check($ipKey, $config->loginAttemptsPerMinute, MINUTE) === false) {
            return $this->fail(429, 'too-many-requests', 'Terlalu banyak percobaan login. Coba lagi dalam 1 menit.');
        }

        $body     = $this->body();
        $login    = strtolower(trim((string) ($body['email'] ?? $body['username'] ?? '')));
        $password = (string) ($body['password'] ?? '');

        if ($login === '' || $password === '') {
            return $this->fail(400, 'invalid-argument', 'Username/Email dan Password tidak boleh kosong!');
        }

        $row = $this->findUserRow($login, $config->localEmailDomain);

        // Same message for unknown user and wrong password
        if ($row === null || empty($row['password_hash']) || ! password_verify($password, $row['password_hash'])) {
            return $this->fail(401, 'invalid-credential', 'Username/Email atau Kata Sandi salah.');
        }
        if (($row['status'] ?? '') === 'nonaktif') {
            return $this->fail(403, 'user-disabled', 'Akun Anda berstatus NONAKTIF. Hubungi Admin untuk mengaktifkan kembali.');
        }

        if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
            db_connect()->table('users')->where('id', $row['id'])->update(['password_hash' => password_hash($password, PASSWORD_DEFAULT)]);
        }

        $identity = Auth::identityFromRow($row);

        return $this->ok([
            'token'   => Auth::issueToken($identity['uid']),
            'user'    => ['uid' => $identity['uid'], 'email' => $identity['email']],
            'profile' => $this->profileFor($identity),
        ]);
    }

    /** GET /api/auth/me */
    public function me(): ResponseInterface
    {
        $user = Auth::user();
        if ($user === null) {
            return $this->fail(401, 'unauthenticated', 'Belum login.');
        }

        return $this->ok(['user' => ['uid' => $user['uid'], 'email' => $user['email']], 'profile' => $this->profileFor($user)]);
    }

    /** POST /api/auth/logout */
    public function logout(): ResponseInterface
    {
        $token = Auth::bearerToken();
        if ($token !== null) {
            Auth::revokeToken($token);
        }

        return $this->ok(['ok' => true]);
    }

    /** POST /api/auth/change-password {currentPassword, newPassword} */
    public function changePassword(): ResponseInterface
    {
        $user = Auth::user();
        if ($user === null) {
            return $this->fail(401, 'unauthenticated', 'Belum login.');
        }

        $body    = $this->body();
        $current = (string) ($body['currentPassword'] ?? '');
        $new     = (string) ($body['newPassword'] ?? '');

        if (mb_strlen($new) < 6) {
            return $this->fail(400, 'weak-password', 'Password baru minimal 6 karakter.');
        }

        $db  = db_connect();
        $row = $db->table('users')->select('password_hash')->where('id', $user['uid'])->get()->getRowArray();
        if (! $row || ! password_verify($current, (string) $row['password_hash'])) {
            return $this->fail(401, 'wrong-password', 'Password lama tidak sesuai.');
        }

        $db->table('users')->where('id', $user['uid'])->update(['password_hash' => password_hash($new, PASSWORD_DEFAULT)]);
        Auth::revokeAllForUser($user['uid'], Auth::bearerToken());

        return $this->ok(['ok' => true]);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function findUserRow(string $login, string $localDomain): ?array
    {
        $users = db_connect()->table('users');

        if (! str_contains($login, '@')) {
            $users->where('username', $login);
        } elseif (str_ends_with($login, '@' . $localDomain)) {
            $users->where('username', substr($login, 0, -strlen('@' . $localDomain)));
        } else {
            $users->groupStart()->where('email', $login)->orWhere('username', $login)->groupEnd();
        }

        $row = $users->get()->getRowArray();

        return $row ?: null;
    }

    /**
     * @param array{uid: string, email: string, username: string, role: string, status: string} $identity
     *
     * @return array<string, mixed>|null
     */
    private function profileFor(array $identity): ?array
    {
        $doc = (new DocumentStore())->get('users', $identity['uid']);

        return $doc === null ? null : Policy::present('users', $identity['uid'], $doc, $identity);
    }
}
