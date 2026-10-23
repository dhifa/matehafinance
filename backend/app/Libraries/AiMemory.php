<?php

namespace App\Libraries;

/**
 * Persistent memory for the AI assistant: short rules/preferences that are
 * added to every prompt so the assistant follows the team's workflow.
 */
class AiMemory
{
    public const MAX_ITEMS  = 100;
    public const MAX_LENGTH = 500;

    /**
     * @return list<array{id: int, content: string, active: bool, source: string, createdBy: string|null, createdAt: string|null, updatedAt: string|null}>
     */
    public static function all(bool $onlyActive = false): array
    {
        $builder = db_connect()->table('ai_memories')->orderBy('id', 'ASC');
        if ($onlyActive) {
            $builder->where('active', 1);
        }

        return array_map([self::class, 'present'], $builder->get()->getResultArray());
    }

    /**
     * @return array<string, mixed>|null the created memory, or null when it duplicates an existing one
     */
    public static function add(string $content, ?string $createdBy, string $source = 'chat'): ?array
    {
        $content = self::clean($content);
        if ($content === '') {
            return null;
        }

        $db = db_connect();
        foreach ($db->table('ai_memories')->select('content')->get()->getResultArray() as $row) {
            if (self::normalize($row['content']) === self::normalize($content)) {
                return null;
            }
        }
        if ($db->table('ai_memories')->countAllResults() >= self::MAX_ITEMS) {
            throw new \RuntimeException('Memori AI sudah penuh (' . self::MAX_ITEMS . ' aturan). Hapus aturan lama terlebih dahulu.');
        }

        $now = date('Y-m-d H:i:s');
        $db->table('ai_memories')->insert([
            'content' => $content, 'active' => 1, 'source' => $source,
            'created_by' => $createdBy, 'created_at' => $now, 'updated_at' => $now,
        ]);

        return self::find((int) $db->insertID());
    }

    /**
     * @param array{content?: string, active?: bool} $changes
     */
    public static function update(int $id, array $changes): ?array
    {
        $row = [];
        if (array_key_exists('content', $changes)) {
            $row['content'] = self::clean((string) $changes['content']);
            if ($row['content'] === '') {
                throw new \InvalidArgumentException('Isi memori tidak boleh kosong.');
            }
        }
        if (array_key_exists('active', $changes)) {
            $row['active'] = $changes['active'] ? 1 : 0;
        }
        if ($row !== []) {
            $row['updated_at'] = date('Y-m-d H:i:s');
            db_connect()->table('ai_memories')->where('id', $id)->update($row);
        }

        return self::find($id);
    }

    public static function delete(int $id): bool
    {
        db_connect()->table('ai_memories')->where('id', $id)->delete();

        return db_connect()->affectedRows() > 0;
    }

    public static function find(int $id): ?array
    {
        $row = db_connect()->table('ai_memories')->where('id', $id)->get()->getRowArray();

        return $row ? self::present($row) : null;
    }

    /** Numbered list for the prompt, e.g. "[#3] Selalu tambahkan ..." */
    public static function promptBlock(): string
    {
        $items = self::all(true);
        if ($items === []) {
            return '(belum ada)';
        }

        return implode("\n", array_map(static fn ($m) => "[#{$m['id']}] {$m['content']}", $items));
    }

    private static function clean(string $content): string
    {
        return mb_substr(trim(preg_replace('/\s+/', ' ', $content)), 0, self::MAX_LENGTH);
    }

    private static function normalize(string $content): string
    {
        return mb_strtolower(trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $content)));
    }

    /**
     * @param array<string, mixed> $row
     */
    private static function present(array $row): array
    {
        return [
            'id'        => (int) $row['id'],
            'content'   => (string) $row['content'],
            'active'    => (bool) $row['active'],
            'source'    => (string) $row['source'],
            'createdBy' => $row['created_by'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
        ];
    }
}
