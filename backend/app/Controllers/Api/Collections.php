<?php

namespace App\Controllers\Api;

use App\Libraries\Auth;
use App\Libraries\DocumentStore;
use App\Libraries\Policy;
use CodeIgniter\Database\Exceptions\DatabaseException;
use CodeIgniter\HTTP\ResponseInterface;
use InvalidArgumentException;

/**
 * Generic document endpoints used by the frontend data layer (src/lib/firestore.ts).
 *
 *   GET    /api/collections/{c}?where=[...]&orderBy=[...]   list (filters/sort applied server side)
 *   POST   /api/collections/{c}                             add with generated id
 *   GET    /api/collections/{c}/{id}                        get
 *   PUT    /api/collections/{c}/{id}  {data, merge}          set / merge
 *   PATCH  /api/collections/{c}/{id}  {data}                 update (supports array transforms)
 *   DELETE /api/collections/{c}/{id}                        delete
 */
class Collections extends BaseApiController
{
    private DocumentStore $store;

    public function __construct()
    {
        $this->store = new DocumentStore();
    }

    public function index(string $collection): ResponseInterface
    {
        if (! $this->store->hasCollection($collection)) {
            return $this->fail(404, 'not-found', 'Koleksi tidak ditemukan.');
        }

        $user    = Auth::user();
        $where   = json_decode((string) $this->request->getGet('where'), true) ?: [];
        $orderBy = json_decode((string) $this->request->getGet('orderBy'), true) ?: [];

        // Equality filters on indexed fields are pushed down to SQL
        $exact = [];
        foreach ($where as $clause) {
            if (is_array($clause) && count($clause) === 3 && $clause[1] === '==' && is_scalar($clause[2])) {
                $exact[$clause[0]] = $clause[2];
            }
        }

        $docs = [];
        foreach ($this->store->all($collection, $exact) as $doc) {
            if (! Policy::canRead($collection, $doc['id'], $doc['data'], $user)) {
                continue;
            }
            if (! self::matches($doc['data'], $where)) {
                continue;
            }
            $docs[] = ['id' => $doc['id'], 'data' => Policy::present($collection, $doc['id'], $doc['data'], $user)];
        }

        self::sort($docs, $orderBy);

        return $this->ok(['docs' => $docs]);
    }

    public function show(string $collection, string $id): ResponseInterface
    {
        if (! $this->store->hasCollection($collection)) {
            return $this->fail(404, 'not-found', 'Koleksi tidak ditemukan.');
        }

        $doc  = $this->store->get($collection, $id);
        $user = Auth::user();

        if ($doc === null) {
            return $this->ok(['id' => $id, 'exists' => false, 'data' => null]);
        }
        if (! Policy::canRead($collection, $id, $doc, $user)) {
            return $this->denied();
        }

        return $this->ok(['id' => $id, 'exists' => true, 'data' => Policy::present($collection, $id, $doc, $user)]);
    }

    public function create(string $collection): ResponseInterface
    {
        return $this->save($collection, DocumentStore::newId(), 'set', $this->body()['data'] ?? [], false);
    }

    public function put(string $collection, string $id): ResponseInterface
    {
        $body = $this->body();

        return $this->save($collection, $id, 'set', $body['data'] ?? [], (bool) ($body['merge'] ?? false));
    }

    public function patch(string $collection, string $id): ResponseInterface
    {
        return $this->save($collection, $id, 'update', $this->body()['data'] ?? [], false);
    }

    public function delete(string $collection, string $id): ResponseInterface
    {
        if (! $this->store->hasCollection($collection)) {
            return $this->fail(404, 'not-found', 'Koleksi tidak ditemukan.');
        }

        $existing = $this->store->get($collection, $id);
        if ($existing === null) {
            return $this->ok(['id' => $id, 'deleted' => false]);
        }
        if (! Policy::canWrite($collection, $id, $existing, null, Auth::user())) {
            return $this->denied();
        }

        $this->store->delete($collection, $id);
        if ($collection === 'users') {
            Auth::revokeAllForUser($id);
        }

        return $this->ok(['id' => $id, 'deleted' => true]);
    }

    private function save(string $collection, string $id, string $mode, mixed $data, bool $merge): ResponseInterface
    {
        if (! $this->store->hasCollection($collection)) {
            return $this->fail(404, 'not-found', 'Koleksi tidak ditemukan.');
        }
        if (! is_array($data) || ($data !== [] && array_is_list($data))) {
            return $this->fail(400, 'invalid-argument', 'Data dokumen tidak valid.');
        }

        try {
            DocumentStore::assertValidId($id);
        } catch (InvalidArgumentException) {
            return $this->fail(400, 'invalid-argument', 'ID dokumen tidak valid.');
        }

        $user     = Auth::user();
        $existing = $this->store->get($collection, $id);

        if ($mode === 'update' && $existing === null) {
            return $this->fail(404, 'not-found', 'Dokumen tidak ditemukan.');
        }

        // Passwords never live inside the JSON document; a "password" field is a password change request
        $newPassword = null;
        if ($collection === 'users' && array_key_exists('password', $data)) {
            $newPassword = is_string($data['password']) ? $data['password'] : null;
            unset($data['password']);
        }

        try {
            $incoming = match (true) {
                $mode === 'update'              => DocumentStore::applyUpdate($existing, $data),
                $merge && $existing !== null    => DocumentStore::deepMerge($existing, $data),
                default                         => $data,
            };
        } catch (InvalidArgumentException $e) {
            return $this->fail(400, 'invalid-argument', $e->getMessage());
        }

        if (! Policy::canWrite($collection, $id, $existing, $incoming, $user)) {
            return $this->denied();
        }

        $extra = [];
        if ($newPassword !== null && $newPassword !== '') {
            if (mb_strlen($newPassword) < 6) {
                return $this->fail(400, 'invalid-argument', 'Password minimal 6 karakter.');
            }
            $extra['password_hash'] = password_hash($newPassword, PASSWORD_DEFAULT);
        }
        if ($collection === 'users') {
            unset($incoming['password_hash']);
            $incoming['uid'] = $id;
            if (! is_string($incoming['username'] ?? null) || trim($incoming['username']) === '') {
                return $this->fail(400, 'invalid-argument', 'Username wajib diisi.');
            }
            $incoming['username'] = strtolower(trim($incoming['username']));
        }

        try {
            $stored = $this->store->set($collection, $id, $incoming, false, $extra);
        } catch (DatabaseException $e) {
            if (str_contains(strtolower($e->getMessage()), 'duplicate')) {
                return $this->fail(409, 'already-exists', 'Username sudah dipakai anggota lain.');
            }

            throw $e;
        }

        if ($collection === 'users' && isset($extra['password_hash']) && $user !== null) {
            // Sign out other sessions of that account after a password change
            Auth::revokeAllForUser($id, $user['uid'] === $id ? Auth::bearerToken() : null);
        }

        return $this->ok(['id' => $id, 'data' => Policy::present($collection, $id, $stored, $user)]);
    }

    /**
     * @param array<string, mixed> $data
     * @param list<mixed>          $where
     */
    private static function matches(array $data, array $where): bool
    {
        foreach ($where as $clause) {
            if (! is_array($clause) || count($clause) !== 3) {
                continue;
            }
            [$field, $op, $value] = $clause;
            $actual               = $data[$field] ?? null;

            $ok = match ($op) {
                '=='             => $actual == $value,
                '!='             => $actual != $value,
                '<'              => $actual < $value,
                '<='             => $actual <= $value,
                '>'              => $actual > $value,
                '>='             => $actual >= $value,
                'in'             => is_array($value) && in_array($actual, $value, false),
                'array-contains' => is_array($actual) && in_array($value, $actual, false),
                default          => true,
            };
            if (! $ok) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param list<array{id: string, data: array<string, mixed>}> $docs
     * @param list<mixed>                                          $orderBy [[field, "asc"|"desc"], ...]
     */
    private static function sort(array &$docs, array $orderBy): void
    {
        if ($orderBy === []) {
            return;
        }

        usort($docs, static function ($a, $b) use ($orderBy) {
            foreach ($orderBy as $spec) {
                if (! is_array($spec) || ! isset($spec[0])) {
                    continue;
                }
                $cmp = ($a['data'][$spec[0]] ?? null) <=> ($b['data'][$spec[0]] ?? null);
                if ($cmp !== 0) {
                    return strtolower((string) ($spec[1] ?? 'asc')) === 'desc' ? -$cmp : $cmp;
                }
            }

            return 0;
        });
    }
}
