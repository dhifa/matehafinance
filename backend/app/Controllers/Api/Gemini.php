<?php

namespace App\Controllers\Api;

use App\Libraries\Auth;
use App\Libraries\Secrets;
use CodeIgniter\HTTP\ResponseInterface;
use Config\Mateha;
use RuntimeException;

/**
 * AI endpoints (ported from the former Node server.ts). Calls the Gemini REST API
 * with structured JSON output and falls back through the configured models.
 */
class Gemini extends BaseApiController
{
    private const RAB_INSTRUCTION = <<<'TXT'
        You are an expert financial spreadsheet analyzer and accountant assistant.
        Your task is to parse a spreadsheet screenshot containing event financial records including "RANCANGAN ANGGARAN BIAYA PROJEK" (RAB, on the left side) and "REPORT ANGGARAN BIAYA PROJEK" (Realisasi, on the right side).

        Key Guidelines:
        1. There might be one or more projects visible in the screenshot. Each project starts with a thick colored header (usually green/blue) consisting of numbering and name, date, and location e.g. "1 | Seminar FGD Kemenperin | 13 November 2025, Sheraton" or "3 | BI JABAR Dokum kopi | 6 November 2025, Majalaya". Parse these header fields exactly:
           - name: The event's name (e.g., "Seminar FGD Kemenperin")
           - date: The event's date (e.g., "13 November 2025")
           - location: The event's location (e.g., "Sheraton")

        2. For each project, extract:
           - A. Income (Pemasukan)
           - B. Details of Accommodation and Other Costs (Akomodasi / Pengeluaran)
           - C. Income Sharing (Mateha x Staff):
               - Extract "Mateha" percentage (e.g., 25% -> 25)
               - Extract "Production Staff Fees" percentage (e.g., 70% -> 70)
               - Extract "Investor" percentage (e.g., 5% -> 5)
           - D. Fee Distribution:
               - Extract individual roles (e.g., zoom op, operator, Cameraman, PIC EVENT), mapping description, qty, expense, and notes (the initials like "ai", "dhifo").
               - Note: Look closely at "PIC Bonus" (usually under block D, e.g. "PIC Bonus (5%)"). Parse that number as picBonusRatio (e.g. 5). Do NOT include the "PIC Bonus" row inside the feeDistribution items array itself, as that is a computed row, only parse its ratio percentage.

        3. Ensure you parse numeric quantities ("qty") and money amounts ("expense" / Rp). Remove monetary symbols like Rp and formatting dots (e.g., "Rp4.000.000" becomes 4000000).
        4. Ignore totals like "Total A", "Total B", "Total D", or "Total Mateha's Profit" rows.
        5. Skip completely blank rows.
        6. Since payment info like DP or Lunas is NOT on these spreadsheet tables, leave paymentStatus as default ("belum") and dpAmount as 0. Do not guess.
        TXT;

    private const RECEIPT_INSTRUCTION = <<<'TXT'
        You are an expert AI financial auditor and receipt/expense parsing assistant for event production and project budgets (RAB & Realisasi).
        Your task is to analyze images of payment receipts, cash receipts, nota belanja, struk bensin (Pertamina/Shell), struk konsumsi/makan/catering, nota toko listrik/bangunan/elektronik, tiket tol/parkir, bukti transfer bank, or vendor invoices.

        From the provided receipt image, extract:
        1. "description": A concise, clear, and professional description in Indonesian suitable for an expense report (e.g., "Bensin Pertamax (SPBU Pertamina)", "Makan Siang Crew 6 Porsi (RM Padang)", "Sewa Genset 5kVA & Kabel", "Pembelian Lakban Hitam & Baterai", "Biaya Tol & Parkir Lapangan").
        2. "qty": Quantity of the primary item or transaction (default: 1 if it's a general lump-sum purchase).
        3. "expense": Unit price or expense per unit in Indonesian Rupiah (IDR) as an integer without dots, decimals, or currency symbols.
        4. "totalAmount": The grand total final amount on the receipt in IDR as an integer.
        5. "merchant": The store/vendor name if visible (e.g. "SPBU Pertamina", "Indomaret", "RM Sederhana", "Warung Berkah").
        6. "date": Date printed on receipt if visible (e.g. "12 November 2025" or "2025-11-12").
        7. "items": If multiple line items are distinctly listed on the receipt, extract them with description, qty, expense (unit price), and total.

        Be very careful to parse Indonesian numbers accurately (dots like 150.000 means 150000).
        TXT;

    /** POST /api/gemini/parse-rab {imageBase64} (signed-in users only) */
    public function parseRab(): ResponseInterface
    {
        if (Auth::user() === null) {
            return $this->fail(401, 'unauthenticated', 'Silakan login terlebih dahulu.');
        }

        $body = $this->body();
        if (empty($body['imageBase64'])) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'Missing image base64 data']);
        }

        $item = [
            'type'       => 'OBJECT',
            'properties' => [
                'num'         => ['type' => 'INTEGER'],
                'description' => ['type' => 'STRING'],
                'qty'         => ['type' => 'INTEGER'],
                'expense'     => ['type' => 'INTEGER'],
                'notes'       => ['type' => 'STRING'],
            ],
            'required' => ['num', 'description', 'qty', 'expense'],
        ];
        $budget = [
            'type'       => 'OBJECT',
            'properties' => [
                'income'        => ['type' => 'ARRAY', 'items' => $item],
                'accommodation' => ['type' => 'ARRAY', 'items' => $item],
                'sharingRatio'  => [
                    'type'       => 'OBJECT',
                    'properties' => ['mateha' => ['type' => 'INTEGER'], 'staff' => ['type' => 'INTEGER'], 'investor' => ['type' => 'INTEGER']],
                    'required'   => ['mateha', 'staff', 'investor'],
                ],
                'picBonusRatio'   => ['type' => 'INTEGER', 'description' => 'Percentage of PIC Bonus (e.g. 5)'],
                'feeDistribution' => ['type' => 'ARRAY', 'items' => $item],
            ],
            'required' => ['income', 'accommodation', 'feeDistribution', 'sharingRatio', 'picBonusRatio'],
        ];
        $schema = [
            'type'        => 'ARRAY',
            'description' => 'Array of extracted projects',
            'items'       => [
                'type'       => 'OBJECT',
                'properties' => [
                    'name'      => ['type' => 'STRING'],
                    'date'      => ['type' => 'STRING'],
                    'location'  => ['type' => 'STRING'],
                    'rab'       => $budget,
                    'realisasi' => $budget,
                ],
                'required' => ['name', 'date', 'location', 'rab', 'realisasi'],
            ],
        ];

        try {
            $parsed = $this->generate(
                (string) $body['imageBase64'],
                'image/png',
                self::RAB_INSTRUCTION,
                'Please analyze this spreadsheet and extract all the visible project events, listing their RAB and Realisasi details according to the requested JSON structure.',
                $schema
            );
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(500)->setJSON(['error' => $e->getMessage()]);
        }

        return $this->ok(['success' => true, 'projects' => is_array($parsed) ? $parsed : []]);
    }

    /** POST /api/gemini/parse-receipt {imageBase64, mimeType} (also used by guests on shared links) */
    public function parseReceipt(): ResponseInterface
    {
        $ipKey = 'ai-receipt-' . md5((string) $this->request->getIPAddress());
        if (service('throttler')->check($ipKey, 20, MINUTE) === false) {
            return $this->response->setStatusCode(429)->setJSON(['error' => 'Terlalu banyak permintaan scan. Coba lagi sebentar.']);
        }

        $body = $this->body();
        if (empty($body['imageBase64'])) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'Data gambar struk (base64) tidak ditemukan']);
        }

        $schema = [
            'type'       => 'OBJECT',
            'properties' => [
                'description' => ['type' => 'STRING', 'description' => 'Deskripsi pengeluaran dalam bahasa Indonesia yang ringkas dan jelas'],
                'qty'         => ['type' => 'INTEGER', 'description' => 'Kuantitas barang/jasa (minimal 1)'],
                'expense'     => ['type' => 'INTEGER', 'description' => 'Harga satuan pengeluaran dalam Rupiah integer'],
                'totalAmount' => ['type' => 'INTEGER', 'description' => 'Total nominal akhir pada struk dalam Rupiah integer'],
                'merchant'    => ['type' => 'STRING', 'description' => 'Nama toko / merchant / vendor'],
                'date'        => ['type' => 'STRING', 'description' => 'Tanggal pada struk'],
                'items'       => [
                    'type'        => 'ARRAY',
                    'description' => 'Daftar item jika ada rincian belanja lebih dari satu',
                    'items'       => [
                        'type'       => 'OBJECT',
                        'properties' => [
                            'description' => ['type' => 'STRING'],
                            'qty'         => ['type' => 'INTEGER'],
                            'expense'     => ['type' => 'INTEGER'],
                            'total'       => ['type' => 'INTEGER'],
                        ],
                        'required' => ['description', 'qty', 'expense', 'total'],
                    ],
                ],
            ],
            'required' => ['description', 'qty', 'expense', 'totalAmount'],
        ];

        try {
            $parsed = $this->generate(
                (string) $body['imageBase64'],
                (string) ($body['mimeType'] ?? 'image/jpeg'),
                self::RECEIPT_INSTRUCTION,
                'Analisis struk/nota pengeluaran ini dan ekstrak deskripsi pengeluaran, jumlah qty, dan nominal harga totalnya.',
                $schema
            );
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(500)->setJSON(['error' => $e->getMessage() ?: 'Gagal memproses scan struk dengan AI']);
        }

        $parsed  = is_array($parsed) ? $parsed : [];
        $qty     = (int) ($parsed['qty'] ?? 0) > 0 ? (int) $parsed['qty'] : 1;
        $expense = (int) ($parsed['expense'] ?? 0);
        $total   = (int) ($parsed['totalAmount'] ?? 0) ?: $qty * $expense;
        if ($expense === 0 && $total > 0) {
            $expense = (int) round($total / $qty);
        }

        return $this->ok([
            'success' => true,
            'data'    => [
                'description' => $parsed['description'] ?? 'Pengeluaran Operasional Struk',
                'qty'         => $qty,
                'expense'     => $expense,
                'totalAmount' => $total,
                'merchant'    => $parsed['merchant'] ?? '',
                'date'        => $parsed['date'] ?? '',
                'items'       => is_array($parsed['items'] ?? null) ? $parsed['items'] : [],
            ],
        ]);
    }

    /**
     * @param array<string, mixed> $schema
     */
    private function generate(string $imageBase64, string $mimeType, string $instruction, string $prompt, array $schema): mixed
    {
        $config = config(Mateha::class);
        try {
            $apiKey = Secrets::geminiApiKey();
        } catch (\Throwable) {
            // app_secrets not migrated yet: fall back to .env
            $apiKey = $config->geminiApiKey;
        }
        if ($apiKey === '') {
            throw new RuntimeException('API key Gemini belum diatur. Admin dapat mengisinya di Dashboard > Pengaturan AI.');
        }

        $mimeType = preg_match('#^image/[a-z0-9.+-]+$#i', $mimeType) ? $mimeType : 'image/jpeg';
        $payload  = [
            'systemInstruction' => ['parts' => [['text' => $instruction]]],
            'contents'          => [[
                'role'  => 'user',
                'parts' => [
                    ['inlineData' => ['mimeType' => $mimeType, 'data' => preg_replace('#^data:[^;]+;base64,#', '', $imageBase64)]],
                    ['text' => $prompt],
                ],
            ]],
            'generationConfig' => ['responseMimeType' => 'application/json', 'responseSchema' => $schema],
        ];

        $client    = service('curlrequest', ['timeout' => 120, 'http_errors' => false, 'verify' => Secrets::caBundle()]);
        $lastError = 'Layanan AI sedang mengalami lonjakan trafik sementara. Silakan coba klik tombol scan kembali.';

        foreach (array_filter(array_map('trim', explode(',', $config->geminiModels))) as $model) {
            try {
                $response = $client->post(
                    'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent',
                    ['headers' => ['Content-Type' => 'application/json', 'x-goog-api-key' => $apiKey], 'body' => json_encode($payload)]
                );
            } catch (\Throwable $e) {
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
                $lastError = 'Gagal memproses parsing data dari reply kecerdasan buatan';
            } else {
                $lastError = $json['error']['message'] ?? $lastError;
                log_message('warning', '[Gemini Fallback] {model} failed: {error}', ['model' => $model, 'error' => $lastError]);
            }
            usleep(400000);
        }

        throw new RuntimeException($lastError);
    }
}
