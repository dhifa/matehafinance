<?php

namespace App\Controllers\Api;

use CodeIgniter\Controller;
use CodeIgniter\HTTP\ResponseInterface;

abstract class BaseApiController extends Controller
{
    /**
     * @return array<string, mixed>
     */
    protected function body(): array
    {
        $raw = $this->request->getBody();
        if ($raw === null || $raw === '') {
            return [];
        }
        $data = json_decode($raw, true);

        return is_array($data) ? $data : [];
    }

    protected function ok(mixed $payload): ResponseInterface
    {
        return $this->response->setJSON($payload);
    }

    protected function fail(int $status, string $code, string $message): ResponseInterface
    {
        return $this->response->setStatusCode($status)->setJSON(['error' => $message, 'code' => $code]);
    }

    protected function denied(): ResponseInterface
    {
        return $this->fail(403, 'permission-denied', 'Anda tidak memiliki izin untuk aksi ini.');
    }
}
