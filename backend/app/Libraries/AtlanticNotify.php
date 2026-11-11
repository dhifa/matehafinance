<?php

namespace App\Libraries;

use Config\Services;
use Throwable;

/**
 * Atlantic-Notify (WhatsApp gateway) client. The API key, device id and test
 * number are stored in app_secrets, which the browser can never read.
 */
class AtlanticNotify
{
    public const KEY_API     = 'wa_api_key';
    public const KEY_DEVICE  = 'wa_device_id';
    public const KEY_TESTNUM = 'wa_test_number';

    /**
     * @return array{apiKey: string, deviceId: string, testNumber: string, updatedAt: string|null, updatedBy: string|null}
     */
    public static function config(): array
    {
        $meta = Secrets::meta(self::KEY_DEVICE);

        return [
            'apiKey'     => (string) Secrets::get(self::KEY_API),
            'deviceId'   => (string) Secrets::get(self::KEY_DEVICE),
            'testNumber' => (string) Secrets::get(self::KEY_TESTNUM),
            'updatedAt'  => $meta['updated_at'] ?? null,
            'updatedBy'  => $meta['updated_by'] ?? null,
        ];
    }

    public static function isConfigured(?array $cfg = null): bool
    {
        $cfg ??= self::config();

        return $cfg['apiKey'] !== '' && $cfg['deviceId'] !== '';
    }

    /**
     * @return array<string, mixed>
     */
    public static function status(): array
    {
        $cfg = self::config();

        return [
            'configured' => self::isConfigured($cfg),
            // Only the last 4 characters ever leave the server
            'maskedKey'  => $cfg['apiKey'] !== '' ? '••••' . substr($cfg['apiKey'], -4) : null,
            'deviceId'   => $cfg['deviceId'],
            'testNumber' => $cfg['testNumber'],
            'updatedAt'  => $cfg['updatedAt'],
            'updatedBy'  => $cfg['updatedBy'],
        ];
    }

    /** "0812-3456 789", "+62 812..." or "812..." → "62812..." ("" when not a phone number). */
    public static function normalizePhone(mixed $raw): string
    {
        $digits = preg_replace('/\D/', '', (string) ($raw ?? ''));
        if (str_starts_with($digits, '0')) {
            $digits = '62' . substr($digits, 1);
        } elseif (str_starts_with($digits, '8')) {
            $digits = '62' . $digits;
        }

        return strlen($digits) >= 9 && strlen($digits) <= 15 ? $digits : '';
    }

    /** 6281234567890 → +62 812-****-7890 */
    public static function maskPhone(string $phone): string
    {
        return $phone === '' ? '' : '+' . substr($phone, 0, 2) . ' ' . substr($phone, 2, 3) . '-****-' . substr($phone, -4);
    }

    private static function baseUrl(): string
    {
        // Overridable so tests can point at a mock server
        return rtrim((string) (getenv('WA_API_BASE_URL') ?: 'https://atlantic-notify.com/api/v1'), '/');
    }

    /**
     * @return array{status: int, body: mixed}
     */
    private static function call(array $cfg, string $method, string $path, ?array $body = null): array
    {
        $client  = Services::curlrequest(['timeout' => 20, 'connect_timeout' => 10, 'http_errors' => false, 'verify' => Secrets::caBundle()], null, null, false);
        $options = ['headers' => ['X-API-Key' => $cfg['apiKey'], 'Accept' => 'application/json']];
        if ($body !== null) {
            $options['headers']['Content-Type'] = 'application/json';
            $options['body']                    = json_encode($body, JSON_UNESCAPED_UNICODE);
        }
        $response = $client->request($method, self::baseUrl() . $path, $options);
        $text     = (string) $response->getBody();
        $decoded  = json_decode($text, true);

        return ['status' => $response->getStatusCode(), 'body' => is_array($decoded) ? $decoded : ['message' => mb_substr($text, 0, 200)]];
    }

    private static function failureReason(int $status, mixed $body): string
    {
        $detail = $body['message'] ?? ($body['error']['message'] ?? (is_string($body['error'] ?? null) ? $body['error'] : ($body['errors'][0]['message'] ?? '')));
        if ($status === 401 || $status === 403) {
            return 'API key ditolak oleh Atlantic-Notify' . ($detail ? ": {$detail}" : '');
        }

        return mb_substr((string) ($detail ?: "Atlantic-Notify membalas HTTP {$status}"), 0, 200);
    }

    /**
     * Sends a WhatsApp text. Never throws: network errors come back as a failed result.
     *
     * @return array{ok: bool, reason?: string, messageId?: string}
     */
    public static function sendText(array $cfg, string $to, string $message): array
    {
        try {
            ['status' => $status, 'body' => $body] = self::call($cfg, 'POST', '/messages/send', [
                'device_id' => $cfg['deviceId'], 'to' => $to, 'type' => 'text', 'message' => $message,
            ]);
            $ok = $status >= 200 && $status < 300 && ($body['success'] ?? true) !== false && ($body['status'] ?? '') !== 'error' && empty($body['error']);
            if (! $ok) {
                return ['ok' => false, 'reason' => self::failureReason($status, $body)];
            }
            $id = $body['data']['id'] ?? ($body['data']['message_id'] ?? ($body['id'] ?? ($body['message_id'] ?? null)));

            return ['ok' => true] + ($id !== null ? ['messageId' => (string) $id] : []);
        } catch (Throwable $e) {
            return ['ok' => false, 'reason' => preg_match('/\b28\b|timed out/i', $e->getMessage())
                ? 'Atlantic-Notify tidak merespons (timeout).'
                : 'Gagal menghubungi Atlantic-Notify: ' . mb_substr($e->getMessage(), 0, 150)];
        }
    }

    /**
     * @return array{ok: bool, message: string}
     */
    public static function checkDevice(array $cfg): array
    {
        try {
            ['status' => $status, 'body' => $body] = self::call($cfg, 'GET', '/devices/' . rawurlencode($cfg['deviceId']));
            if ($status >= 200 && $status < 300) {
                $state = $body['data']['status'] ?? ($body['status'] ?? ($body['data']['state'] ?? null));

                return ['ok' => true, 'message' => 'Terhubung ke Atlantic-Notify' . ($state ? " (status device: {$state})" : '') . '.'];
            }
            if ($status === 404) {
                return ['ok' => false, 'message' => 'Device ID tidak ditemukan di Atlantic-Notify.'];
            }

            return ['ok' => false, 'message' => self::failureReason($status, $body)];
        } catch (Throwable $e) {
            return ['ok' => false, 'message' => 'Gagal menghubungi Atlantic-Notify: ' . mb_substr($e->getMessage(), 0, 150)];
        }
    }

    /**
     * Groups the sending number has joined (GET /groups?device_id=…).
     *
     * @return array{ok: bool, message: string, groups: list<array{id: string, name: string, size: int|null}>}
     */
    public static function listGroups(array $cfg): array
    {
        try {
            ['status' => $status, 'body' => $body] = self::call($cfg, 'GET', '/groups?device_id=' . rawurlencode($cfg['deviceId']));
            $ok = $status >= 200 && $status < 300 && ($body['success'] ?? true) !== false && ($body['status'] ?? '') !== 'error';
            if (! $ok) {
                return ['ok' => false, 'message' => self::failureReason($status, $body), 'groups' => []];
            }

            $groups = self::parseGroups($body);
            if ($groups === []) {
                $note = is_string($body['message'] ?? null) && $body['message'] !== '' ? ' Pesan Atlantic-Notify: "' . mb_substr($body['message'], 0, 150) . '".' : '';
                log_message('warning', 'Atlantic-Notify GET /groups returned no group ids. Shape: ' . self::describeShape($body));

                return ['ok' => true, 'message' => 'Tidak ada grup yang terbaca dari jawaban Atlantic-Notify.' . $note . ' Bentuk respons: ' . mb_substr(self::describeShape($body), 0, 600), 'groups' => []];
            }

            return ['ok' => true, 'message' => 'OK', 'groups' => $groups];
        } catch (Throwable $e) {
            return ['ok' => false, 'message' => 'Gagal menghubungi Atlantic-Notify: ' . mb_substr($e->getMessage(), 0, 150), 'groups' => []];
        }
    }

    private const GROUP_ID = '/^\d[\d-]*@g\.us$/';
    private const ID_KEYS  = ['id', 'jid', 'group_id', 'groupid', 'groupjid', 'chat_id', 'chatid', 'gid', 'wa_id', 'remotejid'];

    /** Field lookup that ignores letter case (the gateway sends e.g. "JID" and "Name"). */
    private static function field(mixed $obj, string ...$names): mixed
    {
        if (! is_array($obj)) {
            return null;
        }
        foreach ($names as $name) {
            if (array_key_exists($name, $obj)) {
                return $obj[$name];
            }
        }
        $lower = [];
        foreach (array_keys($obj) as $k) {
            $lower[strtolower((string) $k)] ??= $k;
        }
        foreach ($names as $name) {
            if (isset($lower[strtolower($name)])) {
                return $obj[$lower[strtolower($name)]];
            }
        }

        return null;
    }

    /** An id field as a group id ("120363…@g.us"), or "" when it is not a group. */
    private static function groupIdOf(array $obj): string
    {
        foreach (self::ID_KEYS as $key) {
            $v = self::field($obj, $key);
            if (is_array($v)) {
                $v = $v['_serialized'] ?? ((($v['server'] ?? '') === 'g.us' && ! empty($v['user'])) ? $v['user'] . '@g.us' : ($v['id'] ?? null));
            }
            if ($v === null || is_array($v)) {
                continue;
            }
            $id = trim((string) $v);
            // A bare number counts as a group only where the field or object is clearly a group
            if (preg_match('/^\d[\d-]*$/', $id) && ($key === 'group_id' || $key === 'groupid' || self::field($obj, 'subject') !== null || self::field($obj, 'participants') !== null)) {
                $id .= '@g.us';
            }
            if (preg_match(self::GROUP_ID, $id)) {
                return $id;
            }
        }

        return '';
    }

    /**
     * Finds the groups anywhere in a GET /groups response. The response shape
     * is not documented, so the whole JSON is walked: lists, objects keyed by
     * group id, nested data / groups / result fields, or plain lists of ids.
     * Only WhatsApp group ids (…@g.us) are kept.
     *
     * @return list<array{id: string, name: string, size: int|null}>
     */
    public static function parseGroups(mixed $body): array
    {
        $out = [];
        $add = static function (string $id, ?array $g) use (&$out): void {
            // Topic / description is never used: it can hold private notes
            $name    = trim((string) (self::field($g, 'name', 'subject', 'title', 'group_name') ?? self::field(self::field($g, 'groupMetadata'), 'subject') ?? ''));
            $size    = self::field($g, 'size', 'participants_count', 'participantscount', 'participantcount', 'member_count', 'members_count');
            $members = self::field($g, 'participants');
            if ($size === null && is_array($members)) {
                $size = count($members);
            }
            $prev     = $out[$id] ?? null;
            $out[$id] = [
                'id'   => $id,
                'name' => mb_substr($name !== '' ? $name : ($prev['name'] ?? $id), 0, 120),
                'size' => is_numeric($size) ? (int) $size : ($prev['size'] ?? null),
            ];
        };
        $walk = static function (mixed $node, int $depth, ?string $keyHint = null) use (&$walk, $add): void {
            if ($depth > 8 || $node === null) {
                return;
            }
            if (is_string($node)) {
                if (preg_match(self::GROUP_ID, trim($node))) {
                    $add(trim($node), null);
                }

                return;
            }
            if (! is_array($node)) {
                return;
            }
            if (! array_is_list($node)) {
                $id = self::groupIdOf($node) ?: (($keyHint !== null && preg_match(self::GROUP_ID, $keyHint)) ? $keyHint : '');
                if ($id !== '') {
                    $add($id, $node);
                }
            }
            foreach ($node as $k => $v) {
                if (is_string($k) && strtolower($k) === 'participants') {
                    continue; // members are people, not groups
                }
                if (is_array($v) || (is_string($v) && array_is_list($node))) {
                    $walk($v, $depth + 1, is_string($k) ? $k : null);
                } elseif (is_string($v) && is_string($k) && preg_match(self::GROUP_ID, $k)) {
                    $add($k, ['name' => $v]);
                }
            }
        };
        $walk($body, 0);
        $out = array_values($out);
        usort($out, static fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return $out;
    }

    /** Field names and types only (no values), to diagnose an unexpected response. */
    public static function describeShape(mixed $node, int $depth = 0): string
    {
        if ($node === null) {
            return 'null';
        }
        if (! is_array($node)) {
            return match (true) { is_bool($node) => 'boolean', is_int($node), is_float($node) => 'number', default => 'string' };
        }
        if (array_is_list($node)) {
            return 'array(' . count($node) . ')' . ($node !== [] && $depth <= 2 ? ' of ' . self::describeShape($node[0], $depth + 1) : '');
        }
        $keys = array_slice(array_keys($node), 0, 12);
        if ($depth > 2) {
            return '{' . implode(', ', $keys) . '}';
        }

        return '{' . implode(', ', array_map(static fn ($k) => $k . ': ' . self::describeShape($node[$k], $depth + 1), $keys)) . (count($node) > 12 ? ', …' : '') . '}';
    }
}
