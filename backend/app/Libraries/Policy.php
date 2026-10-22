<?php

namespace App\Libraries;

/**
 * Per-collection access rules, ported from the former firestore.rules.
 *
 * Differences from the old rules (intentional hardening):
 *  - user documents never expose passwords, and guests/other staff only see public profile fields;
 *  - non-admins cannot change their own role or active status;
 *  - guests on a shared project link can only change Point B expenses (as security_spec.md intended).
 */
class Policy
{
    /** Profile fields visible to guests and to other non-admin users (team lists, PIC pickers). */
    private const PUBLIC_USER_FIELDS = ['uid', 'username', 'displayName', 'role', 'jobTitle', 'status'];

    /** Fields only an admin may change on a user document. */
    private const ADMIN_ONLY_USER_FIELDS = ['role', 'status', 'accessLevel', 'kasbonPlafondType', 'kasbonPercentLimit', 'kasbonFixedLimit'];

    /**
     * @param array<string, mixed> $doc
     */
    public static function canRead(string $collection, string $id, array $doc, ?array $user): bool
    {
        $signedIn = $user !== null;

        return match ($collection) {
            'projects', 'settings', 'shared-payslips', 'users' => true,
            'invoices', 'quotations', 'kwitansi', 'clients', 'banks' => $signedIn,
            'payslips' => $signedIn && (Auth::isAdmin($user) || ($doc['staffUsername'] ?? null) === $user['username']),
            'kasbon_requests' => $signedIn && (
                Auth::isAdmin($user)
                || ($doc['staffUid'] ?? null) === $user['uid']
                || ($doc['staffUsername'] ?? null) === $user['username']
            ),
            default => false,
        };
    }

    /**
     * @param array<string, mixed>|null $existing current document (null when creating)
     * @param array<string, mixed>|null $incoming resulting document (null when deleting)
     */
    public static function canWrite(string $collection, string $id, ?array $existing, ?array $incoming, ?array $user): bool
    {
        $signedIn = $user !== null;
        $delete   = $incoming === null;

        switch ($collection) {
            case 'projects':
                if ($delete) {
                    return $signedIn;
                }
                if (! is_string($incoming['name'] ?? null) || trim($incoming['name']) === '' || mb_strlen($incoming['name']) > 250) {
                    return false;
                }
                if ($signedIn) {
                    return true;
                }

                // Guests on a shared link may only edit Point B expenses (realisasi.accommodation) of an open project
                if ($existing === null || ! empty($existing['isPointBClosed'])) {
                    return false;
                }
                $strip = static function (array $project): array {
                    unset($project['realisasi']['accommodation']);

                    return self::normalize($project);
                };

                return $strip($existing) === $strip($incoming);

            case 'users':
                if ($delete) {
                    return Auth::isAdmin($user);
                }
                if (Auth::isAdmin($user)) {
                    return true;
                }
                if (! $signedIn || $user['uid'] !== $id) {
                    return false;
                }
                foreach (self::ADMIN_ONLY_USER_FIELDS as $field) {
                    if (($existing[$field] ?? null) !== ($incoming[$field] ?? null)) {
                        return false;
                    }
                }

                return true;

            case 'settings':
                return Auth::isAdmin($user);

            case 'payslips':
                return Auth::isAdmin($user);

            case 'invoices':
            case 'quotations':
            case 'kwitansi':
            case 'clients':
            case 'banks':
                return Auth::isFinanceOrAdmin($user);

            case 'kasbon_requests':
                if (Auth::isAdmin($user)) {
                    return true;
                }
                if (! $signedIn || $delete) {
                    return false;
                }
                if ($existing === null) {
                    return ($incoming['staffUid'] ?? null) === $user['uid']
                        && ($incoming['status'] ?? null) === 'pending'
                        && is_numeric($incoming['amount'] ?? null) && $incoming['amount'] > 0;
                }

                return ($existing['staffUid'] ?? null) === $user['uid'] && ($incoming['status'] ?? null) === 'pending';

            case 'shared-payslips':
                return $delete ? Auth::isAdmin($user) : $signedIn;
        }

        return false;
    }

    /**
     * Sorts object keys recursively so documents compare equal regardless of key order.
     */
    private static function normalize(mixed $value): mixed
    {
        if (! is_array($value)) {
            return is_float($value) && floor($value) === $value ? (int) $value : $value;
        }
        if (! array_is_list($value)) {
            ksort($value);
        }

        return array_map([self::class, 'normalize'], $value);
    }

    /**
     * Removes fields the requester must not see.
     *
     * @param array<string, mixed> $doc
     *
     * @return array<string, mixed>
     */
    public static function present(string $collection, string $id, array $doc, ?array $user): array
    {
        if ($collection !== 'users') {
            return $doc;
        }

        unset($doc['password'], $doc['password_hash']);
        $doc['uid'] ??= $id;

        if (Auth::isAdmin($user) || ($user !== null && $user['uid'] === $id)) {
            return $doc;
        }

        return array_intersect_key($doc, array_flip(self::PUBLIC_USER_FIELDS));
    }
}
