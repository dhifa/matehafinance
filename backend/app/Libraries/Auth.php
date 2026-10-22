<?php

namespace App\Libraries;

use Config\Mateha;

/**
 * Token based authentication. Tokens are random 32-byte values handed to the
 * client once; only their SHA-256 hash is stored.
 */
class Auth
{
    /** @var array<string, mixed>|null */
    private static ?array $current = null;

    /**
     * The authenticated user for this request, or null for guests.
     *
     * @return array{uid: string, email: string, username: string, role: string, status: string}|null
     */
    public static function user(): ?array
    {
        return self::$current;
    }

    public static function setUser(?array $user): void
    {
        self::$current = $user;
    }

    public static function isAdmin(?array $user = null): bool
    {
        $user ??= self::$current;
        if ($user === null) {
            return false;
        }

        $email = strtolower($user['email']);

        return $user['role'] === 'admin'
            || in_array($email, array_map('strtolower', config(Mateha::class)->ownerEmails), true)
            || str_starts_with($email, 'admin@');
    }

    public static function isFinanceOrAdmin(?array $user = null): bool
    {
        $user ??= self::$current;

        return $user !== null && (self::isAdmin($user) || $user['role'] === 'finance');
    }

    /**
     * Builds the auth identity from a users table row.
     *
     * @param array<string, mixed> $row
     *
     * @return array{uid: string, email: string, username: string, role: string, status: string}
     */
    public static function identityFromRow(array $row): array
    {
        $domain   = config(Mateha::class)->localEmailDomain;
        $username = (string) ($row['username'] ?? '');

        return [
            'uid'      => (string) $row['id'],
            'email'    => (string) (($row['email'] ?? '') !== '' ? $row['email'] : "{$username}@{$domain}"),
            'username' => $username,
            'role'     => strtolower((string) ($row['role'] ?? 'staff')),
            'status'   => (string) ($row['status'] ?? 'aktif'),
        ];
    }

    public static function issueToken(string $userId): string
    {
        $token = bin2hex(random_bytes(32));
        $now   = time();

        db_connect()->table('auth_tokens')->insert([
            'user_id'    => $userId,
            'token_hash' => hash('sha256', $token),
            'created_at' => date('Y-m-d H:i:s', $now),
            'expires_at' => date('Y-m-d H:i:s', $now + config(Mateha::class)->tokenTtl),
        ]);

        return $token;
    }

    /**
     * Resolves a bearer token to its user, or null when invalid, expired or the account is inactive.
     *
     * @return array{uid: string, email: string, username: string, role: string, status: string}|null
     */
    public static function resolveToken(string $token): ?array
    {
        if (! preg_match('/^[a-f0-9]{64}$/', $token)) {
            return null;
        }

        $db  = db_connect();
        $row = $db->table('auth_tokens t')
            ->select('t.id AS token_id, u.id, u.username, u.email, u.role, u.status')
            ->join('users u', 'u.id = t.user_id')
            ->where('t.token_hash', hash('sha256', $token))
            ->where('t.expires_at >', date('Y-m-d H:i:s'))
            ->get()->getRowArray();

        if (! $row || ($row['status'] ?? '') === 'nonaktif') {
            return null;
        }

        $db->table('auth_tokens')->where('id', $row['token_id'])->update(['last_used_at' => date('Y-m-d H:i:s')]);

        return self::identityFromRow($row);
    }

    public static function revokeToken(string $token): void
    {
        db_connect()->table('auth_tokens')->where('token_hash', hash('sha256', $token))->delete();
    }

    public static function revokeAllForUser(string $userId, ?string $exceptToken = null): void
    {
        $builder = db_connect()->table('auth_tokens')->where('user_id', $userId);
        if ($exceptToken !== null) {
            $builder->where('token_hash !=', hash('sha256', $exceptToken));
        }
        $builder->delete();
    }

    public static function bearerToken(): ?string
    {
        $header = service('request')->getHeaderLine('Authorization');

        return preg_match('/^Bearer\s+(\S+)$/i', $header, $m) ? $m[1] : null;
    }
}
