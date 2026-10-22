<?php

namespace App\Libraries;

use Config\Mateha;

/**
 * Server-only settings stored in `app_secrets`.
 */
class Secrets
{
    public const GEMINI_API_KEY = 'gemini_api_key';

    public static function get(string $name): ?string
    {
        $row = db_connect()->table('app_secrets')->select('value')->where('name', $name)->get()->getRowArray();

        return $row ? (string) $row['value'] : null;
    }

    /**
     * @return array{updated_at: string|null, updated_by: string|null}|null
     */
    public static function meta(string $name): ?array
    {
        $row = db_connect()->table('app_secrets')->select('updated_at, updated_by')->where('name', $name)->get()->getRowArray();

        return $row ?: null;
    }

    public static function set(string $name, string $value, ?string $updatedBy): void
    {
        $db  = db_connect();
        $row = ['value' => $value, 'updated_at' => date('Y-m-d H:i:s'), 'updated_by' => $updatedBy];

        if ($db->table('app_secrets')->where('name', $name)->countAllResults() > 0) {
            $db->table('app_secrets')->where('name', $name)->update($row);
        } else {
            $db->table('app_secrets')->insert(['name' => $name] + $row);
        }
    }

    public static function delete(string $name): void
    {
        db_connect()->table('app_secrets')->where('name', $name)->delete();
    }

    /** Key set from the admin dashboard wins; otherwise GEMINI_API_KEY from .env. */
    public static function geminiApiKey(): string
    {
        $stored = self::get(self::GEMINI_API_KEY);

        return ($stored !== null && $stored !== '') ? $stored : config(Mateha::class)->geminiApiKey;
    }

    public static function mask(string $value): string
    {
        $len = strlen($value);

        return $len <= 8 ? str_repeat('•', $len) : substr($value, 0, 4) . '…' . substr($value, -4);
    }
}
