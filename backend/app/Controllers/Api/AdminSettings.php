<?php

namespace App\Controllers\Api;

use App\Libraries\Auth;
use App\Libraries\Secrets;
use CodeIgniter\Database\Exceptions\DatabaseException;
use CodeIgniter\HTTP\ResponseInterface;
use Config\Mateha;
use Throwable;

/**
 * Admin-only server settings. The Gemini API key is write-only from the
 * browser's point of view: only a masked preview is ever returned.
 */
class AdminSettings extends BaseApiController
{
    private const MIGRATE_HINT = 'Tabel pengaturan belum ada di database. Jalankan "php spark migrate" di folder backend, lalu coba lagi.';

    /** GET /api/admin/settings/ai */
    public function ai(): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }

        try {
            return $this->ok($this->aiStatus());
        } catch (DatabaseException) {
            return $this->fail(500, 'failed-precondition', self::MIGRATE_HINT);
        }
    }

    /** PUT /api/admin/settings/ai {apiKey} */
    public function saveAi(): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }

        $key = trim((string) ($this->body()['apiKey'] ?? ''));
        if (! preg_match('/^[A-Za-z0-9_\-.]{20,300}$/', $key)) {
            return $this->fail(400, 'invalid-argument', 'Format API key tidak valid. Salin ulang key dari Google AI Studio (tanpa spasi atau tanda kutip).');
        }

        try {
            Secrets::set(Secrets::GEMINI_API_KEY, $key, Auth::user()['username']);

            return $this->ok($this->aiStatus());
        } catch (DatabaseException) {
            return $this->fail(500, 'failed-precondition', self::MIGRATE_HINT);
        }
    }

    /** DELETE /api/admin/settings/ai */
    public function deleteAi(): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }

        try {
            Secrets::delete(Secrets::GEMINI_API_KEY);

            return $this->ok($this->aiStatus());
        } catch (DatabaseException) {
            return $this->fail(500, 'failed-precondition', self::MIGRATE_HINT);
        }
    }

    /** POST /api/admin/settings/ai/test {apiKey?} — tests the given key, or the active one */
    public function testAi(): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }

        try {
            $key = trim((string) ($this->body()['apiKey'] ?? '')) ?: Secrets::geminiApiKey();
        } catch (DatabaseException) {
            return $this->fail(500, 'failed-precondition', self::MIGRATE_HINT);
        }
        if ($key === '') {
            return $this->fail(400, 'failed-precondition', 'Belum ada API key yang bisa dites.');
        }

        try {
            $response = service('curlrequest', ['timeout' => 20, 'http_errors' => false])->get(
                'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
                ['headers' => ['x-goog-api-key' => $key]]
            );
        } catch (Throwable $e) {
            return $this->ok(['ok' => false, 'message' => Secrets::explainConnectionError($e)]);
        }

        if ($response->getStatusCode() === 200) {
            return $this->ok(['ok' => true, 'message' => 'API key valid dan terhubung ke Gemini.']);
        }

        $json = json_decode($response->getBody(), true);

        return $this->ok([
            'ok'      => false,
            'message' => 'API key ditolak oleh Google: ' . ($json['error']['message'] ?? ('HTTP ' . $response->getStatusCode())),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function aiStatus(): array
    {
        $stored = Secrets::get(Secrets::GEMINI_API_KEY);
        $env    = config(Mateha::class)->geminiApiKey;
        $meta   = Secrets::meta(Secrets::GEMINI_API_KEY);

        $source = match (true) {
            $stored !== null && $stored !== '' => 'dashboard',
            $env !== ''                        => 'env',
            default                            => 'none',
        };

        return [
            'configured' => $source !== 'none',
            'source'     => $source,
            'maskedKey'  => match ($source) {
                'dashboard' => Secrets::mask($stored),
                'env'       => Secrets::mask($env),
                default     => null,
            },
            'updatedAt' => $source === 'dashboard' ? ($meta['updated_at'] ?? null) : null,
            'updatedBy' => $source === 'dashboard' ? ($meta['updated_by'] ?? null) : null,
        ];
    }
}
