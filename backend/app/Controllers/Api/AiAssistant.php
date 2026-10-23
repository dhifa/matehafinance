<?php

namespace App\Controllers\Api;

use App\Libraries\AiMemory;
use App\Libraries\Auth;
use App\Libraries\DocumentStore;
use App\Libraries\GeminiClient;
use CodeIgniter\HTTP\ResponseInterface;
use Config\Mateha;
use RuntimeException;
use Throwable;

/**
 * Chat assistant for the whole app: turns a free-text request into a draft event,
 * invoice, quotation or kwitansi. The frontend shows the draft and only creates
 * the document after the user confirms. Admins can also teach long-term workflow
 * rules, which are stored in ai_memories and applied to every later request.
 */
class AiAssistant extends BaseApiController
{
    private const TYPES          = ['event', 'invoice', 'quotation', 'kwitansi', 'none'];
    private const EVENT_SECTIONS = ['income', 'accommodation', 'feeDistribution'];
    private const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
    private const MAX_ATTACHMENTS  = 3;
    private const RULE_HINT        = '/ke ?depan|mulai (sekarang|hari ini)|selalu|setiap|tiap kali|jangan|ingat|aturan|lupakan|hapus|ganti|default|biasanya|kalau|jika|apabila|harus|wajib/i';
    private const MAX_ATTACHMENT_CHARS = 6_000_000; // base64, ~4.5 MB per file
    private const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

    private const INSTRUCTION = <<<'TXT'
        Kamu adalah asisten administrasi Mateha Production, perusahaan produksi event (live streaming, multimedia, dokumentasi) di Bandung.
        Kamu membantu admin membuat DRAF dokumen dari percakapan: event (Lembar Kerja RAB), invoice (tagihan), quotation (surat penawaran harga), atau kwitansi (bukti pembayaran).

        MENENTUKAN JENIS (field "type"):
        - "event": admin menceritakan event/acara yang akan dikerjakan (tanggal, lokasi, layanan, kru, biaya).
        - "invoice": admin minta membuat tagihan/invoice/faktur, termasuk invoice DP/uang muka atau pelunasan.
        - "quotation": admin minta penawaran harga/quotation/surat penawaran.
        - "kwitansi": admin minta kwitansi/bukti terima pembayaran.
        - "none": pesan hanya obrolan, pertanyaan, atau hanya berisi aturan untuk diingat.
        Jika admin sedang mengoreksi DRAF SAAT INI, pertahankan jenisnya. Jika admin meminta dokumen lain, ganti jenis dan buat draf baru (boleh memakai info dari draf sebelumnya, mis. "buatkan invoicenya" setelah draf event/quotation).

        ATURAN UMUM:
        1. Tanggal format YYYY-MM-DD. Jika tahun tidak disebut, pilih tanggal terdekat yang belum lewat dari "Hari ini". Jika tanggal dokumen tidak disebut, pakai hari ini.
        2. Harga satuan dalam Rupiah (integer). Urutan sumber harga: harga yang disebut admin > ATURAN YANG DIINGAT > item event terkait > KATALOG HARGA. Jika tidak ada sumber, isi 0 dan sebutkan di "missing". JANGAN mengarang harga.
        3. Nama klien: cocokkan dengan DAFTAR KLIEN bila mirip, lalu isi customerName (nama perusahaan/instansi), customerContact (PIC) dan customerPhone dari data klien.
        4. reply: balasan singkat dan ramah dalam Bahasa Indonesia (maks. 3 kalimat) yang merangkum draf/perubahan dan menanyakan info yang masih kurang. Kamu HANYA menyusun draf; dokumen baru tersimpan setelah admin menekan tombol "Buat ..." di panel draf. JANGAN pernah menulis bahwa event/dokumen sudah dibuat atau disimpan; tulis misalnya "Draf event sudah siap, silakan periksa lalu klik Buat Event."
        5. missing: daftar singkat info penting yang masih kosong (mis. "harga VJ", "nama PIC klien").
        6. Isi HANYA objek yang sesuai dengan "type"; objek lain biarkan kosong.

        EVENT (objek "event"):
        - name: nama event saja, kapitalisasi judul; location: tempat event; dates: daftar tanggal (rentang menjadi beberapa tanggal).
        - income (A. Pemasukan): layanan yang dijual ke klien (mis. "Live Streaming 3 Kamera", "VJ / Visual Jockey").
        - accommodation (B. Akomodasi): biaya sewa/operasional/transport/konsumsi (mis. "Matador", "Bensin dan Tol"). "matador 2" = Matador qty 2.
        - feeDistribution (D. Fee Kru): hanya jika admin menyebut kru/honor/nama orang; notes = inisial/nama kru.

        INVOICE (objek "invoice") dan QUOTATION (objek "quotation"):
        - items: layanan yang ditagihkan/ditawarkan. Field: description (nama item), qty + unit (satuan qty, mis. "unit", "m", "set", "package"; kosongkan jika tidak jelas), days + timeUnit (waktu, mis. 2 "hari", 1 "event"; default days 1 dan timeUnit kosong), price (harga satuan). Total item = qty × days × price. Contoh "3 kamera 2 hari @2jt" = qty 3, unit "unit", days 2, timeUnit "hari", price 2000000. Jika event berlangsung beberapa tanggal dan harganya per hari, isi days sesuai jumlah tanggal.
        - subItems: poin rincian isi sebuah item (mis. Sound System berisi "mic wireless" 4 unit, "mixer dan operator" 1 set). Isi price pada poin HANYA jika poin itu biaya tambahan (add-cost) di luar harga item; jika sudah termasuk, price 0. Jika admin menyebut event dari DAFTAR EVENT, ambil item dari Pemasukan (RAB) event tersebut beserta harganya, dan subject = "<jenis layanan> - <nama event>".
        - invoice.dueDate opsional; invoice DP/uang muka: isDp = true dan dpPercent (mis. 50). Invoice pelunasan dari invoice DP: items sama, isDp = false, dan sebutkan sisa tagihan di reply.
        - quotation.validUntil: jika tidak disebut, 14 hari setelah tanggal quotation.
        - termsAndConditions: isi hanya jika admin menyebut syarat khusus.

        KWITANSI (objek "kwitansi"):
        - Jika admin menyebut invoice dari DAFTAR INVOICE, isi invoiceNumber, customerName dari invoice itu, dan amount = total invoice (untuk invoice DP pakai nominal DP-nya kecuali admin menyebut lain).
        - paymentFor: keterangan pembayaran (mis. "Pelunasan Live Streaming - Bagimu Negeri").
        - paymentMethod: "Tunai / Cash", "Transfer Bank", atau sesuai yang disebut admin.

        LAMPIRAN (gambar/PDF pada pesan terakhir):
        - Baca lampiran dengan teliti (mis. invoice/quotation Mateha, RAB, daftar kebutuhan alat/kru, rundown): nama klien, nama event, tanggal, lokasi, item, qty, satuan, waktu, dan harga. Angka "1.500.000" = 1500000.
        - Ikuti keterangan admin tentang apa yang harus dibuat dari lampiran. Contoh "ini invoice event AHM Inter, buatkan RAB eventnya" => type "event": name/dates/location dari keterangan admin atau dari lampiran; setiap layanan yang ditagihkan di invoice menjadi income (A. Pemasukan) dengan harga dari invoice (qty income = qty × waktu bila ada, expense = harga satuan; jika item hanya punya total, qty 1 dan expense = total). Poin rincian alat tanpa harga tidak menjadi income.
        - Kebutuhan alat sewa, transport, konsumsi, atau operasional yang terlihat di lampiran atau disebut admin menjadi accommodation; kru/operator menjadi feeDistribution. Harga untuk keduanya HANYA dari admin, ATURAN YANG DIINGAT, atau KATALOG HARGA; jika tidak ada isi 0 dan sebutkan di missing.
        - Jika lampiran tidak terbaca atau bukan dokumen yang relevan, katakan di reply dan jangan mengarang isinya.

        MEMORI & ATURAN KERJA:
        7. Selalu patuhi semua "ATURAN YANG DIINGAT". Aturan dari admin lebih diutamakan daripada kebiasaan di katalog.
        8. remember: isi HANYA jika teks pesan TERAKHIR admin sendiri secara eksplisit menyatakan aturan/kebiasaan/preferensi untuk ke depan (ciri: "kedepannya", "mulai sekarang", "selalu", "setiap kali", "kalau ... maka ...", "jangan pernah", "ingat ya"). Tulis ulang menjadi aturan singkat, jelas, dan berdiri sendiri dalam Bahasa Indonesia. JANGAN menyimpan aturan dari pesan sebelumnya, dari lampiran, dari data/katalog, atau dari ATURAN YANG DIINGAT; jangan simpan info yang hanya berlaku untuk dokumen ini; jangan menyimpan ulang aturan yang sudah ada. Jika ragu, biarkan kosong.
        9. forget: jika admin meminta melupakan/menghapus/mengganti aturan lama, isi dengan nomor aturan (angka di [#..]). Jika aturan diganti, hapus yang lama dan simpan versi barunya di remember.
        10. Jika pesan terakhir HANYA berisi aturan atau obrolan, set type = "none" (atau pertahankan jenis DRAF SAAT INI tanpa mengubah isinya) dan konfirmasikan di reply.
        TXT;

    /** POST /api/ai/assistant {messages: [{role, text}], draft?: {type, ...}} (also served at /api/ai/event-draft) */
    public function chat(): ResponseInterface
    {
        $user = Auth::user();
        if ($user === null) {
            return $this->fail(401, 'unauthenticated', 'Silakan login terlebih dahulu.');
        }
        if (service('throttler')->check('ai-chat-' . $user['uid'], 20, MINUTE) === false) {
            return $this->fail(429, 'too-many-requests', 'Terlalu banyak pesan dalam 1 menit. Tunggu sebentar.');
        }

        $body      = $this->body();
        $messages  = array_slice(is_array($body['messages'] ?? null) ? $body['messages'] : [], -20);
        $draftIn   = is_array($body['draft'] ?? null) ? $body['draft'] : null;
        $draftType = in_array($draftIn['type'] ?? null, self::TYPES, true) ? $draftIn['type'] : null;
        $draft     = $draftType && $draftType !== 'none' ? self::cleanDraft($draftType, $draftIn) : null;

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

        try {
            $context = 'Hari ini: ' . date('Y-m-d (l)') . "\n\n"
                . "ATURAN YANG DIINGAT:\n" . $this->memoryBlock() . "\n\n"
                . $this->dataContext() . "\n\n"
                . "DRAF SAAT INI:\n" . ($draft ? json_encode(['type' => $draftType] + $draft, JSON_UNESCAPED_UNICODE) : '(belum ada)') . "\n\n"
                . "PERCAKAPAN:\n" . implode("\n", $transcript);

            $attachments = self::attachmentParts($body['attachments'] ?? null);
            if (is_string($attachments)) {
                return $this->fail(400, 'invalid-argument', $attachments);
            }
            if ($attachments !== []) {
                $context .= "\n\nLAMPIRAN pada pesan terakhir: " . count($attachments) . ' file (terlampir setelah teks ini).';
            }

            // Reading images/PDFs takes the model longer than plain text
            $result = GeminiClient::generateJson(
                [['text' => $context], ...$attachments],
                self::INSTRUCTION,
                self::schema(),
                $attachments === [] ? 45 : 75,
                config(Mateha::class)->geminiChatModels
            );
        } catch (RuntimeException $e) {
            return $this->fail(502, 'ai-error', $e->getMessage());
        } catch (Throwable $e) {
            log_message('error', '[AI assistant] {message} in {file}:{line}', ['message' => $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine()]);

            return $this->fail(500, 'internal', 'Asisten AI error: ' . $e->getMessage());
        }

        $result = is_array($result) ? $result : [];
        $type   = in_array($result['type'] ?? null, self::TYPES, true) ? $result['type'] : 'none';

        $outDraft = null;
        if ($type !== 'none') {
            $outDraft = ['type' => $type] + self::cleanDraft($type, is_array($result[$type] ?? null) ? $result[$type] : []);
        } elseif ($draft !== null) {
            // Rule-only or chit-chat message: keep the draft being edited
            $type     = $draftType;
            $outDraft = ['type' => $draftType] + $draft;
        }

        [$saved, $forgotten, $memoryError] = $this->applyMemory($result, $user, self::lastAdminMessage($messages));

        return $this->ok([
            'reply'             => trim((string) ($result['reply'] ?? '')) ?: 'Siap. Silakan periksa draf sebelum disimpan.',
            'missing'           => array_values(array_filter(array_map('strval', is_array($result['missing'] ?? null) ? $result['missing'] : []))),
            'type'              => $type,
            'draft'             => $outDraft,
            'memoriesSaved'     => $saved,
            'memoriesForgotten' => $forgotten,
            'memoryError'       => $memoryError,
        ]);
    }

    /**
     * Validates attached files and turns them into Gemini inline-data parts.
     *
     * @return list<array<string, mixed>>|string the parts, or an error message
     */
    private static function attachmentParts(mixed $raw): array|string
    {
        if (! is_array($raw) || $raw === []) {
            return [];
        }
        if (count($raw) > self::MAX_ATTACHMENTS) {
            return 'Maksimal ' . self::MAX_ATTACHMENTS . ' lampiran per pesan.';
        }

        $parts = [];
        foreach ($raw as $file) {
            $mime = strtolower((string) ($file['mimeType'] ?? ''));
            $data = (string) ($file['data'] ?? '');
            if (! in_array($mime, self::ATTACHMENT_TYPES, true)) {
                return 'Lampiran harus berupa gambar (JPG/PNG) atau PDF.';
            }
            if ($data === '' || strlen($data) > self::MAX_ATTACHMENT_CHARS || strspn($data, self::BASE64_CHARS) !== strlen($data)) {
                return 'Lampiran kosong, rusak, atau terlalu besar (maks. sekitar 4 MB per file).';
            }
            $parts[] = GeminiClient::imagePart($data, $mime);
        }

        return $parts;
    }

    /**
     * Only admins can teach or change the shared workflow memory.
     *
     * @param array<string, mixed>                                                               $result
     * @param array{uid: string, email: string, username: string, role: string, status: string} $user
     *
     * @return array{0: list<array<string, mixed>>, 1: list<array<string, mixed>>, 2: string|null}
     */
    private function applyMemory(array $result, array $user, string $lastMessage): array
    {
        $saved = $forgotten = [];
        if (! Auth::isAdmin($user)) {
            return [$saved, $forgotten, null];
        }
        // The model sometimes "remembers" rules the admin never stated; only act
        // when the admin's own last message reads like a rule or a request to forget one
        if (! preg_match(self::RULE_HINT, $lastMessage)) {
            return [$saved, $forgotten, null];
        }

        try {
            foreach (array_slice((array) ($result['forget'] ?? []), 0, 10) as $id) {
                $memory = AiMemory::find((int) $id);
                if ($memory !== null && AiMemory::delete($memory['id'])) {
                    $forgotten[] = $memory;
                }
            }
            foreach (array_slice((array) ($result['remember'] ?? []), 0, 5) as $content) {
                $memory = AiMemory::add((string) $content, $user['username']);
                if ($memory !== null) {
                    $saved[] = $memory;
                }
            }
        } catch (Throwable $e) {
            return [$saved, $forgotten, $e->getMessage()];
        }

        return [$saved, $forgotten, null];
    }

    /**
     * @param list<mixed> $messages
     */
    private static function lastAdminMessage(array $messages): string
    {
        for ($i = count($messages) - 1; $i >= 0; $i--) {
            if (is_array($messages[$i]) && ($messages[$i]['role'] ?? '') !== 'assistant') {
                return (string) ($messages[$i]['text'] ?? '');
            }
        }

        return '';
    }

    private function memoryBlock(): string
    {
        try {
            return AiMemory::promptBlock();
        } catch (Throwable) {
            return '(belum ada)'; // ai_memories not migrated yet
        }
    }

    /**
     * Clients, recent events, recent invoices and a price catalog, so the AI can
     * fill customer details, reuse event items and reference invoices.
     */
    private function dataContext(): string
    {
        $store  = new DocumentStore();
        $recent = static function (array $docs, int $limit): array {
            usort($docs, static fn ($a, $b) => strcmp((string) ($b['data']['createdAt'] ?? ''), (string) ($a['data']['createdAt'] ?? '')));

            return array_slice($docs, 0, $limit);
        };
        $rp = static fn ($n) => number_format((int) $n, 0, ',', '.');

        $clients = [];
        foreach ($recent($store->all('clients'), 80) as $doc) {
            $c       = $doc['data'];
            $company = (string) ($c['company'] ?? '');
            $name    = (string) ($c['name'] ?? '');
            $clients[] = sprintf(
                '- %s%s | PIC: %s | Telp: %s',
                mb_substr($company !== '' ? $company : $name, 0, 80),
                $company !== '' && $name !== '' && $name !== $company ? ' (' . mb_substr($name, 0, 60) . ')' : '',
                $c['pic'] ?? '-',
                $c['phone'] ?? '-'
            );
        }

        $catalog    = [];
        $addCatalog = static function (string $section, $desc, $price) use (&$catalog): void {
            $desc = trim((string) $desc);
            $key  = $section . '|' . mb_strtolower($desc);
            if ($desc !== '' && ! isset($catalog[$key]) && count($catalog) < 150) {
                $catalog[$key] = "- [{$section}] " . mb_substr($desc, 0, 80) . ' | harga satuan ' . (int) $price;
            }
        };

        $events = [];
        foreach ($recent($store->all('projects'), 40) as $i => $doc) {
            $p   = $doc['data'];
            $rab = is_array($p['rab'] ?? null) ? $p['rab'] : [];
            foreach (self::EVENT_SECTIONS as $section) {
                foreach (is_array($rab[$section] ?? null) ? $rab[$section] : [] as $row) {
                    if (is_array($row)) {
                        $addCatalog($section, $row['description'] ?? '', $row['expense'] ?? 0);
                    }
                }
            }
            if ($i < 25) {
                $income = [];
                foreach (is_array($rab['income'] ?? null) ? $rab['income'] : [] as $row) {
                    if (is_array($row) && trim((string) ($row['description'] ?? '')) !== '') {
                        $income[] = mb_substr(trim((string) $row['description']), 0, 60) . ' ' . (int) ($row['qty'] ?? 1) . 'x' . $rp($row['expense'] ?? 0);
                    }
                }
                $events[] = sprintf('- %s | %s | %s | Pemasukan: %s', $p['name'] ?? '-', $p['date'] ?? '-', $p['location'] ?? '-', $income ? implode('; ', $income) : '-');
            }
        }

        $invoices = [];
        foreach ($recent($store->all('invoices'), 30) as $doc) {
            $inv        = $doc['data'];
            $invoices[] = sprintf(
                '- %s | %s | %s | total %s%s | status %s | tgl %s',
                $inv['invoiceNumber'] ?? '-',
                $inv['customerName'] ?? '-',
                mb_substr((string) ($inv['subject'] ?? ''), 0, 60),
                $rp($inv['grandTotal'] ?? 0),
                ! empty($inv['isDp']) ? ' (DP ' . ($inv['dpPercent'] ?? '') . '%, nilai kontrak ' . $rp($inv['totalAmount'] ?? 0) . ', sisa ' . $rp($inv['remainingAmount'] ?? 0) . ')' : '',
                $inv['status'] ?? '-',
                $inv['date'] ?? '-'
            );
            foreach (is_array($inv['items'] ?? null) ? $inv['items'] : [] as $row) {
                if (is_array($row)) {
                    $addCatalog('invoice', $row['description'] ?? '', $row['price'] ?? 0);
                }
            }
        }
        foreach ($recent($store->all('quotations'), 30) as $doc) {
            foreach (is_array($doc['data']['items'] ?? null) ? $doc['data']['items'] : [] as $row) {
                if (is_array($row)) {
                    $addCatalog('quotation', $row['description'] ?? '', $row['price'] ?? 0);
                }
            }
        }

        $block = static fn (string $title, array $rows) => $title . ":\n" . ($rows ? implode("\n", $rows) : '(kosong)');

        return implode("\n\n", [
            $block('DAFTAR KLIEN', $clients),
            $block('DAFTAR EVENT (terbaru dulu)', $events),
            $block('DAFTAR INVOICE (terbaru dulu)', $invoices),
            $block('KATALOG HARGA (terbaru dulu)', array_values($catalog)),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private static function schema(): array
    {
        $budgetItem = [
            'type'       => 'OBJECT',
            'properties' => ['description' => ['type' => 'STRING'], 'qty' => ['type' => 'INTEGER'], 'expense' => ['type' => 'INTEGER'], 'notes' => ['type' => 'STRING']],
            'required'   => ['description', 'qty', 'expense'],
        ];
        $docItem = [
            'type'       => 'OBJECT',
            'properties' => [
                'description' => ['type' => 'STRING'],
                'qty'         => ['type' => 'INTEGER'],
                'unit'        => ['type' => 'STRING'],
                'days'        => ['type' => 'INTEGER'],
                'timeUnit'    => ['type' => 'STRING'],
                'price'       => ['type' => 'INTEGER'],
                'subItems'    => ['type' => 'ARRAY', 'items' => [
                    'type'       => 'OBJECT',
                    'properties' => ['description' => ['type' => 'STRING'], 'qty' => ['type' => 'INTEGER'], 'unit' => ['type' => 'STRING'], 'price' => ['type' => 'INTEGER']],
                    'required'   => ['description', 'qty', 'price'],
                ]],
            ],
            'required'   => ['description', 'qty', 'days', 'price'],
        ];
        $customer = [
            'customerName'       => ['type' => 'STRING'],
            'customerContact'    => ['type' => 'STRING'],
            'customerPhone'      => ['type' => 'STRING'],
            'subject'            => ['type' => 'STRING'],
            'date'               => ['type' => 'STRING'],
            'items'              => ['type' => 'ARRAY', 'items' => $docItem],
            'termsAndConditions' => ['type' => 'STRING'],
        ];

        return [
            'type'       => 'OBJECT',
            'properties' => [
                'type'     => ['type' => 'STRING', 'enum' => self::TYPES],
                'reply'    => ['type' => 'STRING'],
                'missing'  => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
                'remember' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
                'forget'   => ['type' => 'ARRAY', 'items' => ['type' => 'INTEGER']],
                'event'    => [
                    'type'       => 'OBJECT',
                    'properties' => [
                        'name'            => ['type' => 'STRING'],
                        'location'        => ['type' => 'STRING'],
                        'dates'           => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
                        'income'          => ['type' => 'ARRAY', 'items' => $budgetItem],
                        'accommodation'   => ['type' => 'ARRAY', 'items' => $budgetItem],
                        'feeDistribution' => ['type' => 'ARRAY', 'items' => $budgetItem],
                    ],
                ],
                'invoice'   => ['type' => 'OBJECT', 'properties' => $customer + ['dueDate' => ['type' => 'STRING'], 'isDp' => ['type' => 'BOOLEAN'], 'dpPercent' => ['type' => 'INTEGER']]],
                'quotation' => ['type' => 'OBJECT', 'properties' => $customer + ['validUntil' => ['type' => 'STRING']]],
                'kwitansi'  => [
                    'type'       => 'OBJECT',
                    'properties' => [
                        'customerName'  => ['type' => 'STRING'],
                        'amount'        => ['type' => 'INTEGER'],
                        'paymentFor'    => ['type' => 'STRING'],
                        'date'          => ['type' => 'STRING'],
                        'paymentMethod' => ['type' => 'STRING'],
                        'invoiceNumber' => ['type' => 'STRING'],
                    ],
                ],
            ],
            'required' => ['type', 'reply'],
        ];
    }

    /**
     * @param array<string, mixed> $d
     *
     * @return array<string, mixed>
     */
    private static function cleanDraft(string $type, array $d): array
    {
        $str      = static fn ($v, int $max = 200) => mb_substr(trim((string) ($v ?? '')), 0, $max);
        $int      = static fn ($v, int $min, int $max) => max($min, min($max, (int) round((float) ($v ?? 0))));
        $date     = static fn ($v) => is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) && strtotime($v) !== false ? $v : '';
        $docItems = static function ($rows) use ($str, $int): array {
            $out = [];
            foreach (array_slice(is_array($rows) ? $rows : [], 0, 50) as $r) {
                if (is_array($r) && ($desc = $str($r['description'] ?? '', 500)) !== '') {
                    $subs = [];
                    foreach (array_slice(is_array($r['subItems'] ?? null) ? $r['subItems'] : [], 0, 30) as $sub) {
                        if (is_array($sub) && ($subDesc = $str($sub['description'] ?? '', 200)) !== '') {
                            $subs[] = ['description' => $subDesc, 'qty' => $int($sub['qty'] ?? 1, 1, 10000), 'unit' => $str($sub['unit'] ?? '', 20), 'price' => $int($sub['price'] ?? 0, 0, 10_000_000_000)];
                        }
                    }
                    $out[] = [
                        'description' => $desc,
                        'qty'         => $int($r['qty'] ?? 1, 1, 10000),
                        'unit'        => $str($r['unit'] ?? '', 20),
                        'days'        => $int($r['days'] ?? 1, 1, 366),
                        'timeUnit'    => $str($r['timeUnit'] ?? '', 20),
                        'price'       => $int($r['price'] ?? 0, 0, 10_000_000_000),
                        'subItems'    => $subs,
                    ];
                }
            }

            return $out;
        };
        $customer = static fn (array $d) => [
            'customerName'       => $str($d['customerName'] ?? ''),
            'customerContact'    => $str($d['customerContact'] ?? ''),
            'customerPhone'      => $str($d['customerPhone'] ?? '', 40),
            'subject'            => $str($d['subject'] ?? ''),
            'date'               => $date($d['date'] ?? '') ?: date('Y-m-d'),
            'items'              => $docItems($d['items'] ?? []),
            'termsAndConditions' => $str($d['termsAndConditions'] ?? '', 1000),
        ];

        switch ($type) {
            case 'event':
                $dates = [];
                foreach ((array) ($d['dates'] ?? []) as $v) {
                    if (($v = $date($v)) !== '') {
                        $dates[] = $v;
                    }
                }
                sort($dates);
                $clean = ['name' => $str($d['name'] ?? ''), 'location' => $str($d['location'] ?? ''), 'dates' => array_values(array_unique(array_slice($dates, 0, 31)))];
                foreach (self::EVENT_SECTIONS as $section) {
                    $rows = [];
                    foreach (array_slice(is_array($d[$section] ?? null) ? $d[$section] : [], 0, 50) as $r) {
                        if (is_array($r) && ($desc = $str($r['description'] ?? '', 300)) !== '') {
                            $rows[] = ['description' => $desc, 'qty' => $int($r['qty'] ?? 1, 1, 10000), 'expense' => $int($r['expense'] ?? 0, 0, 10_000_000_000), 'notes' => $str($r['notes'] ?? '', 100)];
                        }
                    }
                    $clean[$section] = $rows;
                }

                return $clean;

            case 'invoice':
                $isDp = ! empty($d['isDp']);

                return $customer($d) + [
                    'dueDate'   => $date($d['dueDate'] ?? ''),
                    'isDp'      => $isDp,
                    'dpPercent' => $isDp ? $int($d['dpPercent'] ?? 50, 1, 100) : 0,
                ];

            case 'quotation':
                $clean = $customer($d);

                return $clean + ['validUntil' => $date($d['validUntil'] ?? '') ?: date('Y-m-d', strtotime($clean['date'] . ' +14 days'))];

            case 'kwitansi':
                return [
                    'customerName'  => $str($d['customerName'] ?? ''),
                    'amount'        => $int($d['amount'] ?? 0, 0, 10_000_000_000),
                    'paymentFor'    => $str($d['paymentFor'] ?? '', 500),
                    'date'          => $date($d['date'] ?? '') ?: date('Y-m-d'),
                    'paymentMethod' => $str($d['paymentMethod'] ?? '', 200) ?: 'Transfer Bank',
                    'invoiceNumber' => $str($d['invoiceNumber'] ?? '', 100),
                ];
        }

        return [];
    }
}
