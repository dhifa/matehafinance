<?php

namespace App\Controllers\Api;

use App\Libraries\Auth;
use App\Libraries\Secrets;
use CodeIgniter\HTTP\ResponseInterface;
use Config\Mateha;

/**
 * Admin-only server settings. The Gemini API key is write-only from the
 * browser's point of view: only a masked preview is ever returned.
 */
class AdminSettings extends BaseApiController
{
    /** GET /api/admin/settings/ai */
    public function ai(): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }

        return $this->ok($this->aiStatus());
    }

    /** PUT /api/admin/settings/ai {apiKey} */
    public function saveAi(): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }

        $key = trim((string) ($this->body()['apiKey'] ?? ''));
        if (! preg_match('/^[A-Za-z0-9_\-]{20,200}$/', $key)) {
            return $this->fail(400, 'invalid-argument', 'Format API key tidak valid. Salin ulang key dari Google AI Studio.');
        }

        Secrets::set(Secrets::GEMINI_API_KEY, $key, Auth::user()['username']);

        return $this->ok($this->aiStatus());
    }

    /** DELETE /api/admin/settings/ai */
    public function deleteAi(): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }

        Secrets::delete(Secrets::GEMINI_API_KEY);

        return $this->ok($this->aiStatus());
    }

    /** POST /api/admin/settings/ai/test {apiKey?} — tests the given key, or the active one */
    public function testAi(): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }

        $key = trim((string) ($this->body()['apiKey'] ?? '')) ?: Secrets::geminiApiKey();
        if ($key === '') {
            return $this->fail(400, 'failed-precondition', 'Belum ada API key yang bisa dites.');
        }

        $response = service('curlrequest', ['timeout' => 20, 'http_errors' => false])->get(
            'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
            ['headers' => ['x-goog-api-key' => $key]]
        );

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
