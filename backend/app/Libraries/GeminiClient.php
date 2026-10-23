<?php

namespace App\Libraries;

use Config\Mateha;
use RuntimeException;
use Throwable;

/**
 * Calls the Gemini REST API with structured JSON output, falling back through
 * the configured models on errors (rate limits, overloaded models...).
 */
class GeminiClient
{
    /**
     * @param list<array<string, mixed>> $parts  user content parts (text and/or inlineData)
     * @param array<string, mixed>       $schema responseSchema
     * @param string|null                $models comma separated models to try (default: Mateha::$geminiModels)
     *
     * @return mixed decoded JSON returned by the model
     */
    public static function generateJson(array $parts, string $instruction, array $schema, int $timeout = 120, ?string $models = null): mixed
    {
        $config     = config(Mateha::class);
        $modelList  = array_values(array_filter(array_map('trim', explode(',', $models ?? $config->geminiModels))));

        // Trying several models can exceed php.ini's default 30s request limit
        @set_time_limit(count($modelList) * ($timeout + 5) + 30);

        try {
            $apiKey = Secrets::geminiApiKey();
        } catch (Throwable) {
            // app_secrets not migrated yet: fall back to .env
            $apiKey = $config->geminiApiKey;
        }
        if ($apiKey === '') {
            throw new RuntimeException('API key Gemini belum diatur. Admin dapat mengisinya di Dashboard > Pengaturan AI.');
        }

        $payload = [
            'systemInstruction' => ['parts' => [['text' => $instruction]]],
            'contents'          => [['role' => 'user', 'parts' => $parts]],
            'generationConfig'  => ['responseMimeType' => 'application/json', 'responseSchema' => $schema],
        ];

        $client    = service('curlrequest', ['timeout' => $timeout, 'connect_timeout' => 10, 'http_errors' => false, 'verify' => Secrets::caBundle()]);
        $lastError = 'Layanan AI sedang mengalami lonjakan trafik sementara. Silakan coba lagi.';

        foreach ($modelList as $model) {
            try {
                $response = $client->post(
                    'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent',
                    ['headers' => ['Content-Type' => 'application/json', 'x-goog-api-key' => $apiKey], 'body' => json_encode($payload)]
                );
            } catch (Throwable $e) {
                // A slow model only affects itself: try the next one
                if (preg_match('/\b28\b|timed out/i', $e->getMessage())) {
                    $lastError = "Model AI terlalu lama merespons (lebih dari {$timeout} detik). Coba lagi sebentar lagi.";
                    log_message('warning', '[Gemini Fallback] {model} timed out', ['model' => $model]);

                    continue;
                }

                // Connection/SSL problems affect every model equally, so stop here
                throw new RuntimeException(Secrets::explainConnectionError($e));
            }

            $json = json_decode($response->getBody(), true);

            if ($response->getStatusCode() === 200) {
                $text   = $json['candidates'][0]['content']['parts'][0]['text'] ?? '';
                $result = json_decode($text, true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    return $result;
                }
                $lastError = 'Gagal memproses balasan dari kecerdasan buatan.';
            } else {
                $lastError = $json['error']['message'] ?? $lastError;
                log_message('warning', '[Gemini Fallback] {model} failed: {error}', ['model' => $model, 'error' => $lastError]);
            }
            usleep(400000);
        }

        throw new RuntimeException($lastError);
    }

    /**
     * @return array<string, mixed>
     */
    public static function imagePart(string $imageBase64, string $mimeType): array
    {
        $mimeType = preg_match('#^(image/[a-z0-9.+-]+|application/pdf)$#i', $mimeType) ? $mimeType : 'image/jpeg';

        return ['inlineData' => ['mimeType' => $mimeType, 'data' => preg_replace('#^data:[^;]+;base64,#', '', $imageBase64)]];
    }
}
