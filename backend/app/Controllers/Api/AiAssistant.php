<?php

namespace App\Controllers\Api;

use App\Libraries\Auth;
use App\Libraries\DocumentStore;
use App\Libraries\GeminiClient;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;
use Throwable;

/**
 * Chat assistant that turns a free-text description of an event into a project
 * draft (name, dates, location, RAB items). The frontend shows the draft and
 * only creates the project after the user confirms it.
 */
class AiAssistant extends BaseApiController
{
    private const SECTIONS = ['income', 'accommodation', 'feeDistribution'];

    private const INSTRUCTION = <<<'TXT'
        Kamu adalah asisten administrasi Mateha Production, perusahaan produksi event (live streaming, multimedia, dokumentasi) di Bandung.
        Tugasmu: dari percakapan dengan admin, susun atau perbarui DRAF EVENT untuk Lembar Kerja RAB.

        Aturan pengisian draf:
        1. name: nama event saja (tanpa tanggal/lokasi), gunakan kapitalisasi judul. Contoh "Bagimu Negeri".
        2. location: tempat event, kapitalisasi rapi (contoh "Mercure Lengkong").
        3. dates: daftar tanggal format YYYY-MM-DD. Jika tahun tidak disebut, pilih tanggal terdekat yang belum lewat dari "Hari ini". Rentang tanggal ("23-24 Oktober") menjadi beberapa tanggal.
        4. income (A. Pemasukan): layanan yang dijual ke klien, misalnya "Live Streaming 3 Kamera", "VJ / Visual Jockey", "Dokumentasi Foto". Gabungkan layanan sejenis dalam satu baris bila wajar, qty = jumlah unit/hari sesuai cerita.
        5. accommodation (B. Akomodasi & Operasional): biaya sewa/operasional/transport/konsumsi, misalnya "Matador", "Sound System", "Bensin dan Tol". "matador 2" berarti item Matador qty 2.
        6. feeDistribution (D. Fee Kru): HANYA isi jika admin menyebut kru, honor, atau nama orang yang bertugas. notes = inisial/nama kru bila disebut.
        7. expense = harga satuan dalam Rupiah (integer). Ambil dari KATALOG HARGA bila ada item yang sama atau sangat mirip (pakai deskripsi katalog). Jika admin menyebut harga, pakai harga itu. Jika tidak ada sumber harga, isi 0 dan sebutkan di "missing". JANGAN mengarang harga.
        8. Pertahankan isi DRAF SAAT INI dan hanya ubah bagian yang diminta admin pada pesan terakhir. Jika admin meminta mulai dari awal, buat draf baru.
        9. reply: balasan singkat dan ramah dalam Bahasa Indonesia (maks. 3 kalimat) yang merangkum perubahan dan menanyakan info yang masih kurang.
        10. missing: daftar singkat info yang masih kosong/0 (misal "harga Live Streaming 3 Kamera").
        TXT;

    /** POST /api/ai/event-draft {messages: [{role: "user"|"assistant", text}], draft?: object} */
    public function eventDraft(): ResponseInterface
    {
        $user = Auth::user();
        if ($user === null) {
            return $this->fail(401, 'unauthenticated', 'Silakan login terlebih dahulu.');
        }
        if (service('throttler')->check('ai-chat-' . $user['uid'], 20, MINUTE) === false) {
            return $this->fail(429, 'too-many-requests', 'Terlalu banyak pesan dalam 1 menit. Tunggu sebentar.');
        }

        $body     = $this->body();
        $messages = array_slice(is_array($body['messages'] ?? null) ? $body['messages'] : [], -20);
        $draft    = is_array($body['draft'] ?? null) ? self::cleanDraft($body['draft']) : null;

        $transcript = [];
        foreach ($messages as $m) {
            $text = trim(mb_substr((string) ($m['text'] ?? ''), 0, 2000));
            if ($text !== '') {
                $transcript[] = (($m['role'] ?? '') === 'assistant' ? 'Asisten' : 'Admin') . ': ' . $text;
            }
        }
        if ($transcript === []) {
            return $this->fail(400, 'invalid-argument', 'Pesan tidak boleh kosong.');
        }

        $context = "Hari ini: " . date('Y-m-d (l)') . "\n\n"
            . "KATALOG HARGA (dari event sebelumnya, terbaru dulu):\n" . $this->priceCatalog() . "\n\n"
            . "DRAF SAAT INI:\n" . ($draft ? json_encode($draft, JSON_UNESCAPED_UNICODE) : '(belum ada)') . "\n\n"
            . "PERCAKAPAN:\n" . implode("\n", $transcript);

        $item = [
            'type'       => 'OBJECT',
            'properties' => [
                'description' => ['type' => 'STRING'],
                'qty'         => ['type' => 'INTEGER'],
                'expense'     => ['type' => 'INTEGER'],
                'notes'       => ['type' => 'STRING'],
            ],
            'required' => ['description', 'qty', 'expense'],
        ];
        $schema = [
            'type'       => 'OBJECT',
            'properties' => [
                'reply'   => ['type' => 'STRING'],
                'missing' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
                'draft'   => [
                    'type'       => 'OBJECT',
                    'properties' => [
                        'name'            => ['type' => 'STRING'],
                        'location'        => ['type' => 'STRING'],
                        'dates'           => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
                        'income'          => ['type' => 'ARRAY', 'items' => $item],
                        'accommodation'   => ['type' => 'ARRAY', 'items' => $item],
                        'feeDistribution' => ['type' => 'ARRAY', 'items' => $item],
                    ],
                    'required' => ['name', 'location', 'dates', 'income', 'accommodation', 'feeDistribution'],
                ],
            ],
            'required' => ['reply', 'draft'],
        ];

        try {
            $result = GeminiClient::generateJson([['text' => $context]], self::INSTRUCTION, $schema, 45, config(\Config\Mateha::class)->geminiChatModels);
        } catch (RuntimeException $e) {
            return $this->fail(502, 'ai-error', $e->getMessage());
        } catch (Throwable $e) {
            log_message('error', '[AI event-draft] {message} in {file}:{line}', ['message' => $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine()]);

            return $this->fail(500, 'internal', 'Asisten AI error: ' . $e->getMessage());
        }

        $result = is_array($result) ? $result : [];

        return $this->ok([
            'reply'   => trim((string) ($result['reply'] ?? '')) ?: 'Draf event sudah saya susun. Silakan periksa sebelum dibuat.',
            'missing' => array_values(array_filter(array_map('strval', is_array($result['missing'] ?? null) ? $result['missing'] : []))),
            'draft'   => self::cleanDraft(is_array($result['draft'] ?? null) ? $result['draft'] : []),
        ]);
    }

    /**
     * Most recent price per item description, per RAB section, from existing projects.
     */
    private function priceCatalog(): string
    {
        $projects = (new DocumentStore())->all('projects');
        usort($projects, static fn ($a, $b) => strcmp((string) ($b['data']['createdAt'] ?? ''), (string) ($a['data']['createdAt'] ?? '')));

        $labels  = ['income' => 'A. Pemasukan', 'accommodation' => 'B. Akomodasi', 'feeDistribution' => 'D. Fee Kru'];
        $catalog = array_fill_keys(self::SECTIONS, []);

        foreach ($projects as $project) {
            foreach (self::SECTIONS as $section) {
                $rows = $project['data']['rab'][$section] ?? [];
                foreach (is_array($rows) ? $rows : [] as $row) {
                    if (! is_array($row)) {
                        continue;
                    }
                    $desc = trim((string) ($row['description'] ?? ''));
                    $key  = mb_strtolower($desc);
                    if ($desc === '' || isset($catalog[$section][$key]) || count($catalog[$section]) >= 60) {
                        continue;
                    }
                    $catalog[$section][$key] = sprintf('- %s | harga satuan %d', mb_substr($desc, 0, 80), (int) ($row['expense'] ?? 0));
                }
            }
        }

        $out = [];
        foreach ($catalog as $section => $rows) {
            $out[] = $labels[$section] . ":\n" . ($rows ? implode("\n", $rows) : '(kosong)');
        }

        return implode("\n", $out);
    }

    /**
     * @param array<string, mixed> $draft
     *
     * @return array<string, mixed>
     */
    private static function cleanDraft(array $draft): array
    {
        $dates = [];
        foreach ((array) ($draft['dates'] ?? []) as $d) {
            if (is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && strtotime($d) !== false) {
                $dates[] = $d;
            }
        }
        sort($dates);

        $clean = [
            'name'     => mb_substr(trim((string) ($draft['name'] ?? '')), 0, 200),
            'location' => mb_substr(trim((string) ($draft['location'] ?? '')), 0, 200),
            'dates'    => array_values(array_unique(array_slice($dates, 0, 31))),
        ];

        foreach (self::SECTIONS as $section) {
            $rows = [];
            foreach (array_slice((array) ($draft[$section] ?? []), 0, 50) as $row) {
                $desc = trim((string) ($row['description'] ?? ''));
                if ($desc === '') {
                    continue;
                }
                $rows[] = [
                    'description' => mb_substr($desc, 0, 300),
                    'qty'         => max(1, min(10000, (int) ($row['qty'] ?? 1))),
                    'expense'     => max(0, min(10_000_000_000, (int) ($row['expense'] ?? 0))),
                    'notes'       => mb_substr(trim((string) ($row['notes'] ?? '')), 0, 100),
                ];
            }
            $clean[$section] = $rows;
        }

        return $clean;
    }
}
