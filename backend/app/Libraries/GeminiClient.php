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
     *
     * @return mixed decoded JSON returned by the model
     */
    public static function generateJson(array $parts, string $instruction, array $schema, int $timeout = 120): mixed
    {
        $config = config(Mateha::class);
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

        $client    = service('curlrequest', ['timeout' => $timeout, 'http_errors' => false, 'verify' => Secrets::caBundle()]);
        $lastError = 'Layanan AI sedang mengalami lonjakan trafik sementara. Silakan coba lagi.';

        foreach (array_filter(array_map('trim', explode(',', $config->geminiModels))) as $model) {
            try {
                $response = $client->post(
                    'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent',
                    ['headers' => ['Content-Type' => 'application/json', 'x-goog-api-key' => $apiKey], 'body' => json_encode($payload)]
                );
            } catch (Throwable $e) {
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
        $mimeType = preg_match('#^image/[a-z0-9.+-]+$#i', $mimeType) ? $mimeType : 'image/jpeg';

        return ['inlineData' => ['mimeType' => $mimeType, 'data' => preg_replace('#^data:[^;]+;base64,#', '', $imageBase64)]];
    }
}
