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

            return ['ok' => true, 'message' => 'OK', 'groups' => self::parseGroups($body)];
        } catch (Throwable $e) {
            return ['ok' => false, 'message' => 'Gagal menghubungi Atlantic-Notify: ' . mb_substr($e->getMessage(), 0, 150), 'groups' => []];
        }
    }

    /**
     * Reads a group list from any response shape (the GET /groups response is
     * not documented): data / data.groups / groups, id / jid / group_id (maybe
     * {_serialized}), name / subject. Only WhatsApp group ids (…@g.us) are kept.
     *
     * @return list<array{id: string, name: string, size: int|null}>
     */
    public static function parseGroups(mixed $body): array
    {
        $list = [];
        foreach ([$body['data']['groups'] ?? null, $body['data']['data'] ?? null, $body['groups'] ?? null, $body['data'] ?? null, $body['results'] ?? null, $body] as $cand) {
            if (is_array($cand) && $cand !== [] && array_is_list($cand)) {
                $list = $cand;
                break;
            }
        }
        $out = [];
        foreach ($list as $g) {
            if (! is_array($g)) {
                continue;
            }
            $id = $g['id'] ?? $g['jid'] ?? $g['group_id'] ?? $g['groupId'] ?? $g['chat_id'] ?? '';
            if (is_array($id)) {
                $id = $id['_serialized'] ?? $id['id'] ?? '';
            }
            $id = trim((string) $id);
            if ($id !== '' && ! str_contains($id, '@')) {
                $id .= '@g.us';
            }
            if (! preg_match('/^[0-9-]+@g\.us$/', $id)) {
                continue;
            }
            $name = trim((string) ($g['name'] ?? $g['subject'] ?? $g['title'] ?? $g['groupMetadata']['subject'] ?? ''));
            $size = $g['size'] ?? $g['participants_count'] ?? $g['participantsCount'] ?? $g['member_count'] ?? null;
            if ($size === null && isset($g['participants']) && is_array($g['participants'])) {
                $size = count($g['participants']);
            }
            $out[$id] = ['id' => $id, 'name' => mb_substr($name !== '' ? $name : $id, 0, 120), 'size' => is_numeric($size) ? (int) $size : null];
        }
        $out = array_values($out);
        usort($out, static fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return $out;
    }
}
