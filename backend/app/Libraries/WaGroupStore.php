<?php

namespace App\Libraries;

/**
 * Files for the WhatsApp group feature, kept in writable/ (outside the web
 * root, chmod 600) so no database table is needed:
 *  - wa_groups.json          cached GET /groups list (the only ids we send to)
 *  - wa_group_history.json   last sends: time, admin, group, event, result (no message bodies)
 *  - wa_group_throttle.json  send times of the last minute (server-side rate limit)
 */
class WaGroupStore
{
    public const LIMIT_PER_MINUTE = 10;
    private const HISTORY_KEEP    = 500;

    private static function path(string $name): string
    {
        return WRITEPATH . $name;
    }

    private static function read(string $name, mixed $default): mixed
    {
        $file = self::path($name);
        if (! is_file($file)) {
            return $default;
        }
        $data = json_decode((string) @file_get_contents($file), true);

        return is_array($data) ? $data : $default;
    }

    private static function write(string $name, array $data): void
    {
        $file = self::path($name);
        $tmp  = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
        file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
        @chmod($tmp, 0600);
        rename($tmp, $file);
    }

    /** @return array{groups: list<array{id: string, name: string, size: int|null}>, fetchedAt: string|null, fetchedBy: string|null} */
    public static function groups(): array
    {
        $data = self::read('wa_groups.json', []);

        return [
            'groups'    => is_array($data['groups'] ?? null) ? $data['groups'] : [],
            'fetchedAt' => $data['fetchedAt'] ?? null,
            'fetchedBy' => $data['fetchedBy'] ?? null,
        ];
    }

    public static function saveGroups(array $groups, string $by): array
    {
        $data = ['groups' => $groups, 'fetchedAt' => date('c'), 'fetchedBy' => $by];
        self::write('wa_groups.json', $data);

        return $data;
    }

    /** @return array{id: string, name: string, size: int|null}|null */
    public static function findGroup(string $id): ?array
    {
        foreach (self::groups()['groups'] as $g) {
            if (($g['id'] ?? null) === $id) {
                return $g;
            }
        }

        return null;
    }

    /** Reserves one send. Returns 0 when allowed, otherwise the seconds to wait. */
    public static function takeSlot(): int
    {
        $fp = fopen(self::path('wa_group_throttle.lock'), 'c');
        flock($fp, LOCK_EX);
        try {
            $now    = microtime(true);
            $recent = array_values(array_filter(self::read('wa_group_throttle.json', []), static fn ($t) => is_numeric($t) && $now - $t < 60));
            if (count($recent) >= self::LIMIT_PER_MINUTE) {
                return (int) ceil(60 - ($now - min($recent)));
            }
            $recent[] = $now;
            self::write('wa_group_throttle.json', $recent);

            return 0;
        } finally {
            flock($fp, LOCK_UN);
            fclose($fp);
        }
    }

    public static function addHistory(array $entry): void
    {
        $fp = fopen(self::path('wa_group_history.lock'), 'c');
        flock($fp, LOCK_EX);
        try {
            $history = self::read('wa_group_history.json', []);
            array_unshift($history, $entry + ['at' => date('c')]);
            self::write('wa_group_history.json', array_slice($history, 0, self::HISTORY_KEEP));
        } finally {
            flock($fp, LOCK_UN);
            fclose($fp);
        }
    }

    public static function history(int $limit = 50): array
    {
        return array_slice(self::read('wa_group_history.json', []), 0, $limit);
    }
}
