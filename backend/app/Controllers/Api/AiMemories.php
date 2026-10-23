<?php

namespace App\Controllers\Api;

use App\Libraries\AiMemory;
use App\Libraries\Auth;
use CodeIgniter\Database\Exceptions\DatabaseException;
use CodeIgniter\HTTP\ResponseInterface;
use InvalidArgumentException;
use RuntimeException;

/**
 * Admin management of the AI assistant's long-term memory.
 *
 *   GET    /api/ai/memories            list
 *   POST   /api/ai/memories {content}  add
 *   PATCH  /api/ai/memories/{id}       {content?, active?}
 *   DELETE /api/ai/memories/{id}
 */
class AiMemories extends BaseApiController
{
    private const MIGRATE_HINT = 'Tabel memori AI belum ada. Jalankan "php spark migrate" di folder backend.';

    public function index(): ResponseInterface
    {
        return $this->admin(fn () => $this->ok(['memories' => AiMemory::all()]));
    }

    public function create(): ResponseInterface
    {
        return $this->admin(function () {
            $memory = AiMemory::add((string) ($this->body()['content'] ?? ''), Auth::user()['username'], 'manual');
            if ($memory === null) {
                return $this->fail(409, 'already-exists', 'Aturan ini kosong atau sudah ada di memori.');
            }

            return $this->ok(['memory' => $memory]);
        });
    }

    public function update(string $id): ResponseInterface
    {
        return $this->admin(function () use ($id) {
            $body    = $this->body();
            $changes = array_intersect_key($body, array_flip(['content', 'active']));
            $memory  = AiMemory::update((int) $id, $changes);

            return $memory === null
                ? $this->fail(404, 'not-found', 'Memori tidak ditemukan.')
                : $this->ok(['memory' => $memory]);
        });
    }

    public function delete(string $id): ResponseInterface
    {
        return $this->admin(fn () => $this->ok(['deleted' => AiMemory::delete((int) $id)]));
    }

    private function admin(callable $action): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }

        try {
            return $action();
        } catch (DatabaseException) {
            return $this->fail(500, 'failed-precondition', self::MIGRATE_HINT);
        } catch (InvalidArgumentException|RuntimeException $e) {
            return $this->fail(400, 'invalid-argument', $e->getMessage());
        }
    }
}
