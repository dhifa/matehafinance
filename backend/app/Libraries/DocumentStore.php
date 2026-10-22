<?php

namespace App\Libraries;

use CodeIgniter\Database\BaseConnection;
use Config\Mateha;
use InvalidArgumentException;

/**
 * JSON document storage on top of MySQL, mirroring the subset of Firestore
 * semantics the frontend relies on (set / merge / update / array union & remove).
 */
class DocumentStore
{
    public const ID_PATTERN = '/^[A-Za-z0-9_\-.@]{1,128}$/';

    private BaseConnection $db;
    private Mateha $config;

    public function __construct(?BaseConnection $db = null)
    {
        $this->db     = $db ?? db_connect();
        $this->config = config(Mateha::class);
    }

    public function hasCollection(string $collection): bool
    {
        return isset($this->config->collections[$collection]);
    }

    public function table(string $collection): string
    {
        if (! $this->hasCollection($collection)) {
            throw new InvalidArgumentException("Unknown collection: {$collection}");
        }

        return $this->config->collections[$collection]['table'];
    }

    public static function assertValidId(string $id): void
    {
        if (! preg_match(self::ID_PATTERN, $id)) {
            throw new InvalidArgumentException('Invalid document id');
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    public function get(string $collection, string $id): ?array
    {
        $row = $this->db->table($this->table($collection))->where('id', $id)->get()->getRowArray();

        return $row ? $this->decode($row) : null;
    }

    /**
     * @param array<string, scalar> $where exact-match filters on indexed JSON fields
     *
     * @return list<array{id: string, data: array<string, mixed>}>
     */
    public function all(string $collection, array $where = []): array
    {
        $builder = $this->db->table($this->table($collection))->select('id, data');
        $indexes = $this->config->collections[$collection]['indexes'];

        foreach ($where as $field => $value) {
            if (isset($indexes[$field])) {
                $builder->where($indexes[$field], $this->indexValue($indexes[$field], $value));
            }
        }

        $docs = [];
        foreach ($builder->get()->getResultArray() as $row) {
            $docs[] = ['id' => $row['id'], 'data' => $this->decode($row)];
        }

        return $docs;
    }

    /**
     * Firestore setDoc(): replaces the document, or deep-merges when $merge is true.
     *
     * @param array<string, mixed> $data
     *
     * @return array<string, mixed> the stored document
     */
    public function set(string $collection, string $id, array $data, bool $merge = false, array $extraColumns = []): array
    {
        self::assertValidId($id);
        $existing = $this->get($collection, $id);
        $final    = ($merge && $existing !== null) ? self::deepMerge($existing, $data) : $data;
        $this->write($collection, $id, $final, $existing === null, $extraColumns);

        return $final;
    }

    /**
     * Firestore updateDoc(): applies field updates to an existing document.
     * Values shaped like {"__op": "arrayUnion"|"arrayRemove", "values": [...]} are array transforms.
     *
     * @param array<string, mixed> $changes
     *
     * @return array<string, mixed>|null the updated document, or null when it doesn't exist
     */
    public function update(string $collection, string $id, array $changes, array $extraColumns = []): ?array
    {
        $existing = $this->get($collection, $id);
        if ($existing === null) {
            return null;
        }

        $final = self::applyUpdate($existing, $changes);
        $this->write($collection, $id, $final, false, $extraColumns);

        return $final;
    }

    public function delete(string $collection, string $id): bool
    {
        $this->db->table($this->table($collection))->where('id', $id)->delete();

        return $this->db->affectedRows() > 0;
    }

    public static function newId(): string
    {
        return bin2hex(random_bytes(10));
    }

    /**
     * @param array<string, mixed> $doc
     * @param array<string, mixed> $changes
     *
     * @return array<string, mixed>
     */
    public static function applyUpdate(array $doc, array $changes): array
    {
        foreach ($changes as $path => $value) {
            $keys = explode('.', (string) $path);
            $ref  = &$doc;
            foreach ($keys as $i => $key) {
                if ($i === count($keys) - 1) {
                    $ref[$key] = self::resolveTransform($ref[$key] ?? null, $value);
                } else {
                    if (! isset($ref[$key]) || ! is_array($ref[$key])) {
                        $ref[$key] = [];
                    }
                    $ref = &$ref[$key];
                }
            }
            unset($ref);
        }

        return $doc;
    }

    /**
     * @param array<string, mixed> $base
     * @param array<string, mixed> $patch
     *
     * @return array<string, mixed>
     */
    public static function deepMerge(array $base, array $patch): array
    {
        foreach ($patch as $key => $value) {
            if (is_array($value) && ! array_is_list($value) && isset($base[$key]) && is_array($base[$key]) && ! array_is_list($base[$key])) {
                $base[$key] = self::deepMerge($base[$key], $value);
            } else {
                $base[$key] = self::resolveTransform($base[$key] ?? null, $value);
            }
        }

        return $base;
    }

    private static function resolveTransform(mixed $current, mixed $value): mixed
    {
        if (! is_array($value) || ! isset($value['__op'])) {
            return $value;
        }

        $list   = is_array($current) && array_is_list($current) ? $current : [];
        $values = is_array($value['values'] ?? null) ? $value['values'] : [];
        $key    = static fn ($v) => json_encode($v);

        if ($value['__op'] === 'arrayUnion') {
            $seen = array_map($key, $list);
            foreach ($values as $v) {
                if (! in_array($key($v), $seen, true)) {
                    $list[] = $v;
                    $seen[] = $key($v);
                }
            }

            return $list;
        }

        if ($value['__op'] === 'arrayRemove') {
            $remove = array_map($key, $values);

            return array_values(array_filter($list, static fn ($v) => ! in_array($key($v), $remove, true)));
        }

        throw new InvalidArgumentException('Unsupported field operation');
    }

    /**
     * @param array<string, mixed> $data
     */
    private function write(string $collection, string $id, array $data, bool $isNew, array $extraColumns): void
    {
        $now = date('Y-m-d H:i:s');
        $row = ['data' => json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'updated_at' => $now] + $extraColumns;

        foreach ($this->config->collections[$collection]['indexes'] as $field => $column) {
            $row[$column] = array_key_exists($field, $data) ? $this->indexValue($column, $data[$field]) : ($column === 'is_public' ? 0 : null);
        }

        $table = $this->db->table($this->table($collection));
        if ($isNew) {
            $table->insert(['id' => $id, 'created_at' => $now] + $row);
        } else {
            $table->where('id', $id)->update($row);
        }
    }

    private function indexValue(string $column, mixed $value): mixed
    {
        if ($column === 'is_public') {
            return $value ? 1 : 0;
        }
        if ($value === null || is_array($value)) {
            return null;
        }

        return mb_substr((string) $value, 0, 191);
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function decode(array $row): array
    {
        $data = json_decode((string) $row['data'], true);

        return is_array($data) ? $data : [];
    }
}
