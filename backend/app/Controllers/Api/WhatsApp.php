<?php

namespace App\Controllers\Api;

use App\Libraries\AtlanticNotify;
use App\Libraries\Auth;
use App\Libraries\DocumentStore;
use App\Libraries\Secrets;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * WhatsApp blasts through Atlantic-Notify:
 *  - payslips: each staff gets a link to THEIR OWN released payslip. Recipients,
 *    numbers and payslips are matched here from the database, never from the
 *    browser; the link carries a random token and opens only after login.
 *  - event info: a message template filled per crew member.
 * wa_logs never contain salary amounts.
 */
class WhatsApp extends BaseApiController
{
    private const BATCH_SIZE    = 5;
    private const SEND_GAP_US   = 1_200_000;
    private const LINK_TTL_DAYS = 30;
    /** Where the crew gathers before leaving, unless an event sets its own meeting point */
    private const DEFAULT_MEETING_POINT = 'Kantor Mateha — https://maps.app.goo.gl/m1sABY77cMVRf3Zx8';
    private const MONTHS        = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    // ------------------------------------------------------------------
    // Settings (admin)
    // ------------------------------------------------------------------

    public function settings(): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }

        return $this->ok(AtlanticNotify::status());
    }

    public function saveSettings(): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }
        $body       = $this->body();
        $apiKey     = trim((string) ($body['apiKey'] ?? ''));
        $deviceId   = trim((string) ($body['deviceId'] ?? ''));
        $testNumber = trim((string) ($body['testNumber'] ?? ''));

        if ($apiKey !== '' && ! preg_match('/^[A-Za-z0-9_\-.]{16,300}$/', $apiKey)) {
            return $this->fail(400, 'invalid-argument', 'Format API key tidak valid.');
        }
        if (! preg_match('/^[A-Za-z0-9_\-.]{4,120}$/', $deviceId)) {
            return $this->fail(400, 'invalid-argument', 'Device ID wajib diisi (lihat dashboard Atlantic-Notify).');
        }
        if ($testNumber !== '' && AtlanticNotify::normalizePhone($testNumber) === '') {
            return $this->fail(400, 'invalid-argument', 'Nomor tes tidak valid. Contoh: 0812 3456 7890.');
        }
        if ($apiKey === '' && AtlanticNotify::config()['apiKey'] === '') {
            return $this->fail(400, 'invalid-argument', 'API key wajib diisi.');
        }

        $by = Auth::user()['username'];
        if ($apiKey !== '') {
            Secrets::set(AtlanticNotify::KEY_API, $apiKey, $by);
        }
        Secrets::set(AtlanticNotify::KEY_DEVICE, $deviceId, $by);
        Secrets::set(AtlanticNotify::KEY_TESTNUM, AtlanticNotify::normalizePhone($testNumber), $by);

        return $this->ok(AtlanticNotify::status());
    }

    public function deleteSettings(): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }
        foreach ([AtlanticNotify::KEY_API, AtlanticNotify::KEY_DEVICE, AtlanticNotify::KEY_TESTNUM] as $name) {
            Secrets::delete($name);
        }

        return $this->ok(AtlanticNotify::status());
    }

    public function testSettings(): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }
        $cfg = AtlanticNotify::config();
        if (! AtlanticNotify::isConfigured($cfg)) {
            return $this->notConfigured();
        }
        $device = AtlanticNotify::checkDevice($cfg);
        if (! $device['ok'] || $cfg['testNumber'] === '') {
            return $this->ok($device + ['sent' => false]);
        }
        $sent = AtlanticNotify::sendText($cfg, $cfg['testNumber'], '✅ Tes koneksi WhatsApp dari Mateha Finance berhasil.');
        $this->log('test', 'koneksi', null, 'nomor tes', $sent);

        return $this->ok([
            'ok'      => $sent['ok'],
            'sent'    => $sent['ok'],
            'message' => $sent['ok']
                ? $device['message'] . ' Pesan tes terkirim ke ' . AtlanticNotify::maskPhone($cfg['testNumber']) . '.'
                : $device['message'] . ' Tapi pesan tes gagal: ' . $sent['reason'],
        ]);
    }

    // ------------------------------------------------------------------
    // Payslips (admin / finance)
    // ------------------------------------------------------------------

    public function payslipList(): ResponseInterface
    {
        if (! Auth::isFinanceOrAdmin()) {
            return $this->denied();
        }
        $period = $this->period();
        if ($period === null) {
            return $this->fail(400, 'invalid-argument', 'Periode tidak valid.');
        }

        return $this->ok([
            'recipients' => array_map([self::class, 'publicRecipient'], $this->payslipRecipients(...$period)),
            'configured' => AtlanticNotify::isConfigured(),
        ]);
    }

    /** POST {month, year, mode: test|pending|failed, confirm?: "KIRIM", origin} — sends one batch. */
    public function payslipSend(): ResponseInterface
    {
        if (! Auth::isFinanceOrAdmin()) {
            return $this->denied();
        }
        $period = $this->period();
        if ($period === null) {
            return $this->fail(400, 'invalid-argument', 'Periode tidak valid.');
        }
        [$month, $year] = $period;
        $body           = $this->body();
        $mode           = (string) ($body['mode'] ?? '');
        if (! in_array($mode, ['test', 'pending', 'failed'], true)) {
            return $this->fail(400, 'invalid-argument', 'Mode pengiriman tidak valid.');
        }
        if ($mode !== 'test' && ($body['confirm'] ?? null) !== 'KIRIM') {
            return $this->fail(400, 'confirmation-required', 'Konfirmasi dibutuhkan: ketik "KIRIM" untuk melanjutkan.');
        }
        $cfg = AtlanticNotify::config();
        if (! AtlanticNotify::isConfigured($cfg)) {
            return $this->notConfigured();
        }
        $origin = $this->appOrigin();
        if ($origin === '') {
            return $this->fail(400, 'invalid-argument', 'Alamat website tidak diketahui.');
        }
        $ref  = sprintf('%d-%02d', $year, $month + 1);
        $user = Auth::user();

        if ($mode === 'test') {
            if ($cfg['testNumber'] === '') {
                return $this->fail(400, 'failed-precondition', 'Isi Nomor Tes di Pengaturan WhatsApp terlebih dahulu.');
            }
            // The test shows the exact message and link, for the sender's own account
            $me    = (new DocumentStore())->get('users', $user['uid']) ?? [];
            $name  = (string) (($me['displayName'] ?? '') ?: $user['username']);
            $token = $this->createSlipLink($user['uid'], $user['username'], "{$user['username']}-{$year}-{$month}", $month, $year);
            $sent  = AtlanticNotify::sendText($cfg, $cfg['testNumber'], "🧪 *PESAN TES*\n\n" . self::payslipMessage($name, $month, $year, "{$origin}/?slip={$token}"));
            $this->log('payslip-test', $ref, $user['uid'], $name, $sent);

            return $sent['ok']
                ? $this->ok(['ok' => true, 'message' => 'Pesan tes terkirim ke ' . AtlanticNotify::maskPhone($cfg['testNumber']) . '.'])
                : $this->fail(502, 'send-failed', 'Pesan tes gagal: ' . $sent['reason']);
        }

        $wanted    = $mode === 'pending' ? 'belum' : 'gagal';
        $queue     = array_values(array_filter($this->payslipRecipients($month, $year), static fn ($r) => $r['status'] === $wanted));
        $batch     = array_slice($queue, 0, self::BATCH_SIZE);
        $processed = [];
        $db        = db_connect();

        foreach ($batch as $i => $r) {
            if ($r['uid'] === null) {
                $result = ['ok' => false, 'reason' => 'Akun staf tidak ditemukan (username slip tidak cocok).'];
            } elseif ($r['phone'] === '') {
                $result = ['ok' => false, 'reason' => 'Nomor WA belum diisi di Manajemen Staff.'];
            } else {
                if ($i > 0) {
                    usleep(self::SEND_GAP_US);
                }
                $token  = $this->createSlipLink($r['uid'], $r['username'], $r['id'], $month, $year);
                $result = AtlanticNotify::sendText($cfg, $r['phone'], self::payslipMessage($r['name'], $month, $year, "{$origin}/?slip={$token}"));
            }
            $status = $result['ok'] ? 'terkirim' : 'gagal';
            $now    = date('Y-m-d H:i:s');
            $row    = ['status' => $status, 'reason' => $result['reason'] ?? null, 'month' => $month, 'year' => $year, 'uid' => $r['uid'], 'sent_by' => $user['username'], 'at' => $now];
            if ($db->table('wa_payslip_status')->where('payslip_id', $r['id'])->countAllResults() > 0) {
                $db->table('wa_payslip_status')->where('payslip_id', $r['id'])->update($row);
            } else {
                $db->table('wa_payslip_status')->insert(['payslip_id' => $r['id']] + $row);
            }
            $this->log('payslip', $ref, $r['uid'], $r['name'], $result);
            $processed[] = self::publicRecipient(['status' => $status, 'reason' => $result['reason'] ?? null, 'at' => $now] + $r);
        }

        return $this->ok(['processed' => $processed, 'remaining' => max(0, count($queue) - count($batch))]);
    }

    /** GET payslip-link/{token} — which period a payslip link opens, for its owner (or admin/finance). */
    public function payslipLink(string $token): ResponseInterface
    {
        $user = Auth::user();
        if ($user === null) {
            return $this->fail(401, 'unauthenticated', 'Silakan login terlebih dahulu.');
        }
        if (! preg_match('/^[A-Za-z0-9_-]{20,100}$/', $token)) {
            return $this->fail(404, 'not-found', 'Link slip gaji tidak valid.');
        }
        $link = db_connect()->table('payslip_links')->where('token', $token)->get()->getRowArray();
        if (! $link) {
            return $this->fail(404, 'not-found', 'Link slip gaji tidak valid.');
        }
        if (strtotime($link['expires_at']) < time()) {
            return $this->fail(410, 'expired', 'Link slip gaji sudah kedaluwarsa. Buka menu Staff Payslip dan pilih periodenya.');
        }
        $mine = $link['uid'] === $user['uid'];
        if (! $mine && ! Auth::isFinanceOrAdmin()) {
            return $this->fail(403, 'permission-denied', 'Link slip gaji ini bukan untuk akun Anda.');
        }

        return $this->ok(['month' => (int) $link['month'], 'year' => (int) $link['year'], 'mine' => $mine]);
    }

    // ------------------------------------------------------------------
    // Event info blast (admin / finance)
    // ------------------------------------------------------------------

    /** GET staff — people who can receive event blasts (no raw phone numbers). */
    public function staff(): ResponseInterface
    {
        if (! Auth::isFinanceOrAdmin()) {
            return $this->denied();
        }
        $staff = [];
        foreach ((new DocumentStore())->all('users') as $doc) {
            $u       = $doc['data'];
            $phone   = AtlanticNotify::normalizePhone($u['phone'] ?? '');
            $staff[] = [
                'uid'      => $doc['id'],
                'name'     => (string) (($u['displayName'] ?? '') ?: ($u['username'] ?? $doc['id'])),
                'username' => (string) ($u['username'] ?? ''),
                'role'     => strtolower((string) ($u['role'] ?? 'staff')),
                'active'   => ($u['status'] ?? '') !== 'nonaktif',
                'hasPhone' => $phone !== '',
                'phone'    => AtlanticNotify::maskPhone($phone),
            ];
        }
        usort($staff, static fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return $this->ok(['staff' => $staff]);
    }

    /** POST {eventId, template, recipients: uid[] (max 5), mode: test|send} */
    public function eventSend(): ResponseInterface
    {
        if (! Auth::isFinanceOrAdmin()) {
            return $this->denied();
        }
        $body     = $this->body();
        $eventId  = (string) ($body['eventId'] ?? '');
        $template = trim((string) ($body['template'] ?? ''));
        $mode     = (string) ($body['mode'] ?? 'send');
        $uids     = array_values(array_filter(array_map('strval', is_array($body['recipients'] ?? null) ? $body['recipients'] : []), static fn ($u) => preg_match('/^[A-Za-z0-9_-]{1,128}$/', $u)));
        if (! preg_match('/^[A-Za-z0-9_-]{1,200}$/', $eventId)) {
            return $this->fail(400, 'invalid-argument', 'Event tidak valid.');
        }
        if ($template === '' || mb_strlen($template) > 3000) {
            return $this->fail(400, 'invalid-argument', 'Isi pesan kosong atau terlalu panjang (maks. 3000 karakter).');
        }
        if ($mode === 'send' && ($uids === [] || count($uids) > self::BATCH_SIZE)) {
            return $this->fail(400, 'invalid-argument', 'Kirim 1–' . self::BATCH_SIZE . ' penerima per permintaan.');
        }
        $cfg = AtlanticNotify::config();
        if (! AtlanticNotify::isConfigured($cfg)) {
            return $this->notConfigured();
        }
        $store = new DocumentStore();
        $event = $store->get('projects', $eventId);
        if ($event === null) {
            return $this->fail(404, 'not-found', 'Event tidak ditemukan.');
        }
        // Point B page where crew log expenses (same link as "Bagikan Point B")
        $reimburse = ! empty($event['isPointBClosed'])
            ? '(input reimburse sedang ditutup admin)'
            : $this->appOrigin() . '/?shareProject=' . rawurlencode($eventId);
        $vars = static fn (string $name) => [
            'nama'      => $name,
            'acara'     => (string) ($event['name'] ?? '-'),
            'tanggal'   => self::formatDates(is_array($event['dates'] ?? null) ? $event['dates'] : [], (string) ($event['date'] ?? '')),
            'call_time' => (string) (($event['callTime'] ?? '') ?: '-'),
            'lokasi'    => (string) (($event['location'] ?? '') ?: '-'),
            'maps'      => (string) (($event['mapsUrl'] ?? '') ?: '-'),
            'titik_kumpul' => (string) (($event['meetingPoint'] ?? '') ?: self::DEFAULT_MEETING_POINT),
            'pic'       => (string) (($event['picName'] ?? '') ?: '-'),
            'rundown'   => (string) (($event['rundownUrl'] ?? '') ?: '-'),
            'reimburse' => $reimburse,
            'catatan'   => (string) (($event['crewNotes'] ?? '') ?: '-'),
        ];
        $ref  = $eventId . ':' . mb_substr((string) ($event['name'] ?? ''), 0, 60);
        $user = Auth::user();

        if ($mode === 'test') {
            if ($cfg['testNumber'] === '') {
                return $this->fail(400, 'failed-precondition', 'Isi Nomor Tes di Pengaturan WhatsApp terlebih dahulu.');
            }
            $me   = $store->get('users', $user['uid']) ?? [];
            $name = (string) (($me['displayName'] ?? '') ?: $user['username']);
            $sent = AtlanticNotify::sendText($cfg, $cfg['testNumber'], "🧪 *PESAN TES*\n\n" . self::render($template, $vars($name)));
            $this->log('event-test', $ref, $user['uid'], $name, $sent);

            return $sent['ok']
                ? $this->ok(['ok' => true, 'message' => 'Pesan tes terkirim ke ' . AtlanticNotify::maskPhone($cfg['testNumber']) . '.'])
                : $this->fail(502, 'send-failed', 'Pesan tes gagal: ' . $sent['reason']);
        }

        // Phone numbers come from the database, never from the browser
        $results = [];
        foreach ($uids as $i => $uid) {
            $u     = $store->get('users', $uid);
            $name  = (string) (($u['displayName'] ?? '') ?: ($u['username'] ?? $uid));
            $phone = AtlanticNotify::normalizePhone($u['phone'] ?? '');
            if ($u === null) {
                $result = ['ok' => false, 'reason' => 'Akun tidak ditemukan.'];
            } elseif ($phone === '') {
                $result = ['ok' => false, 'reason' => 'Nomor WA belum diisi di Manajemen Staff.'];
            } else {
                if ($i > 0) {
                    usleep(self::SEND_GAP_US);
                }
                $result = AtlanticNotify::sendText($cfg, $phone, self::render($template, $vars($name)));
            }
            $this->log('event', $ref, $uid, $name, $result);
            $results[] = ['uid' => $uid, 'name' => $name, 'status' => $result['ok'] ? 'terkirim' : 'gagal', 'reason' => $result['reason'] ?? null];
        }

        return $this->ok(['results' => $results]);
    }

    /** POST {message, recipients: uid[] (max 5), mode: test|send} — {nama} {peran} {pengirim} filled per person. */
    public function broadcastSend(): ResponseInterface
    {
        if (! Auth::isFinanceOrAdmin()) {
            return $this->denied();
        }
        $body    = $this->body();
        $message = trim((string) ($body['message'] ?? ''));
        $mode    = (string) ($body['mode'] ?? 'send');
        $uids    = array_values(array_filter(array_map('strval', is_array($body['recipients'] ?? null) ? $body['recipients'] : []), static fn ($u) => preg_match('/^[A-Za-z0-9_-]{1,128}$/', $u)));
        if ($message === '' || mb_strlen($message) > 3000) {
            return $this->fail(400, 'invalid-argument', 'Isi pesan kosong atau terlalu panjang (maks. 3000 karakter).');
        }
        if ($mode === 'send' && ($uids === [] || count($uids) > self::BATCH_SIZE)) {
            return $this->fail(400, 'invalid-argument', 'Kirim 1–' . self::BATCH_SIZE . ' penerima per permintaan.');
        }
        // {password} gives every recipient a NEW random password (old one stops working). Admin only.
        $withPassword = str_contains($message, '{password}');
        if ($withPassword && ! Auth::isAdmin()) {
            return $this->fail(403, 'permission-denied', 'Hanya admin yang boleh mengirim password akun.');
        }
        $cfg = AtlanticNotify::config();
        if (! AtlanticNotify::isConfigured($cfg)) {
            return $this->notConfigured();
        }
        $store  = new DocumentStore();
        $user   = Auth::user();
        $me     = $store->get('users', $user['uid']) ?? [];
        $sender = (string) (($me['displayName'] ?? '') ?: $user['username']);
        // Account details for the "Info Akun & Login" template. Passwords are never sent.
        $login  = $this->appOrigin() ?: 'https://financestg.mateha.co.id';
        $vars   = static fn (string $name, string $role, string $username, string $password = '(password baru)') => [
            'nama' => $name, 'peran' => $role, 'pengirim' => $sender, 'username' => $username, 'link_login' => $login, 'password' => $password,
        ];
        $ref    = mb_substr(preg_replace('/\s+/', ' ', $message), 0, 60);

        if ($mode === 'test') {
            if ($cfg['testNumber'] === '') {
                return $this->fail(400, 'failed-precondition', 'Isi Nomor Tes di Pengaturan WhatsApp terlebih dahulu.');
            }
            $sent = AtlanticNotify::sendText($cfg, $cfg['testNumber'], "🧪 *PESAN TES*\n\n" . self::render($message, $vars($sender, $user['role'] ?: 'admin', (string) $user['username'], 'Contoh123 (password tidak diganti saat tes)')));
            $this->log('broadcast-test', $ref, $user['uid'], $sender, $sent);

            return $sent['ok']
                ? $this->ok(['ok' => true, 'message' => 'Pesan tes terkirim ke ' . AtlanticNotify::maskPhone($cfg['testNumber']) . '.'])
                : $this->fail(502, 'send-failed', 'Pesan tes gagal: ' . $sent['reason']);
        }

        // Phone numbers come from the database, never from the browser
        $results = [];
        foreach ($uids as $i => $uid) {
            $u     = $store->get('users', $uid);
            $name  = (string) (($u['displayName'] ?? '') ?: ($u['username'] ?? $uid));
            $phone = AtlanticNotify::normalizePhone($u['phone'] ?? '');
            if ($u === null) {
                $result = ['ok' => false, 'reason' => 'Akun tidak ditemukan.'];
            } elseif ($phone === '') {
                $result = ['ok' => false, 'reason' => 'Nomor WA belum diisi di Manajemen Staff.'];
            } elseif ($withPassword && $uid === $user['uid']) {
                $result = ['ok' => false, 'reason' => 'Akun Anda sendiri dilewati. Ganti password lewat tombol Password.'];
            } else {
                if ($i > 0) {
                    usleep(self::SEND_GAP_US);
                }
                $password = $withPassword ? self::temporaryPassword() : null;
                $result   = AtlanticNotify::sendText($cfg, $phone, self::render($message, $vars($name, strtolower((string) ($u['role'] ?? 'staff')), (string) (($u['username'] ?? '') ?: '-'), $password ?? '(password baru)')));
                // Only change the password once the person has it; a failed send leaves the account untouched
                if ($result['ok'] && $password !== null) {
                    try {
                        db_connect()->table('users')->where('id', $uid)->update(['password_hash' => password_hash($password, PASSWORD_DEFAULT)]);
                        Auth::revokeAllForUser($uid); // sign out old sessions, same as an admin password reset
                    } catch (\Throwable $e) {
                        log_message('error', 'Broadcast password reset failed for {uid}: {msg}', ['uid' => $uid, 'msg' => $e->getMessage()]);
                        $result = ['ok' => false, 'reason' => 'Pesan terkirim, tapi password belum diganti (gagal menyimpan). Password di pesan itu belum berlaku — kirim ulang.'];
                    }
                }
            }
            $this->log('broadcast', $ref, $uid, $name, $result);
            $results[] = ['uid' => $uid, 'name' => $name, 'status' => $result['ok'] ? 'terkirim' : 'gagal', 'reason' => $result['reason'] ?? null];
        }

        return $this->ok(['results' => $results]);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /** 8 easy-to-read characters (no 0/O, 1/l/I). */
    private static function temporaryPassword(): string
    {
        $alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $out      = '';
        for ($i = 0; $i < 8; $i++) {
            $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        return $out;
    }

    /**
     * Staff with a RELEASED payslip for the period, matched to their account by username.
     *
     * @return list<array{id: string, uid: string|null, username: string, name: string, phone: string, status: string, reason: string|null, at: string|null}>
     */
    private function payslipRecipients(int $month, int $year): array
    {
        $store      = new DocumentStore();
        $byUsername = [];
        foreach ($store->all('users') as $doc) {
            $byUsername[strtolower(trim((string) ($doc['data']['username'] ?? '')))] = $doc;
        }
        $statuses = [];
        foreach (db_connect()->table('wa_payslip_status')->where('month', $month)->where('year', $year)->get()->getResultArray() as $row) {
            $statuses[$row['payslip_id']] = $row;
        }

        $list = [];
        foreach ($store->all('payslips') as $slip) {
            $s = $slip['data'];
            if (($s['published'] ?? false) !== true || (int) ($s['month'] ?? -1) !== $month || (int) ($s['year'] ?? -1) !== $year) {
                continue;
            }
            $username = strtolower(trim((string) ($s['staffUsername'] ?? '')));
            $user     = $byUsername[$username] ?? null;
            $st       = $statuses[$slip['id']] ?? null;
            $list[]   = [
                'id'       => $slip['id'],
                'uid'      => $user['id'] ?? null,
                'username' => $username,
                'name'     => (string) (($user['data']['displayName'] ?? '') ?: (($s['staffDisplayName'] ?? '') ?: strtoupper($username))),
                'phone'    => AtlanticNotify::normalizePhone($user['data']['phone'] ?? ''),
                'status'   => $st['status'] ?? 'belum',
                'reason'   => $st['reason'] ?? null,
                'at'       => $st['at'] ?? null,
            ];
        }
        usort($list, static fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return $list;
    }

    private static function publicRecipient(array $r): array
    {
        return [
            'id'         => $r['id'],
            'name'       => $r['name'],
            'username'   => $r['username'],
            'hasAccount' => $r['uid'] !== null,
            'phone'      => AtlanticNotify::maskPhone($r['phone']),
            'hasPhone'   => $r['phone'] !== '',
            'status'     => $r['status'],
            'reason'     => $r['reason'],
            'at'         => $r['at'],
        ];
    }

    private function createSlipLink(string $uid, string $username, string $payslipId, int $month, int $year): string
    {
        $token = rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
        db_connect()->table('payslip_links')->insert([
            'token'      => $token,
            'uid'        => $uid,
            'username'   => $username,
            'payslip_id' => $payslipId,
            'month'      => $month,
            'year'       => $year,
            'created_at' => date('Y-m-d H:i:s'),
            'expires_at' => date('Y-m-d H:i:s', time() + self::LINK_TTL_DAYS * 86400),
        ]);

        return $token;
    }

    private static function payslipMessage(string $name, int $month, int $year, string $link): string
    {
        return implode("\n", [
            "Halo *{$name}*,",
            '',
            'Slip gaji periode *' . self::MONTHS[$month] . " {$year}* sudah dirilis.",
            'Silakan cek slip Anda di website (login dengan akun Anda):',
            $link,
            '',
            '✅ Jika sudah sesuai, klik *Ajukan Pencairan Gaji* di halaman slip.',
            '❗ Jika belum sesuai, jangan ajukan pencairan dulu dan hubungi CEO (Dhifa Aksa Hermawan).',
            '',
            '— Mateha Production',
        ]);
    }

    /**
     * @param list<mixed> $dates
     */
    private static function formatDates(array $dates, string $fallback): string
    {
        $valid = array_values(array_filter(array_map('strval', $dates), static fn ($d) => preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)));
        sort($valid);
        if ($valid === []) {
            return $fallback !== '' ? $fallback : '-';
        }
        $groups = [];
        foreach ($valid as $d) {
            $key              = substr($d, 0, 7);
            $groups[$key][]   = (int) substr($d, 8, 2);
        }
        $out = [];
        foreach ($groups as $ym => $days) {
            $out[] = implode(', ', $days) . ' ' . self::MONTHS[(int) substr($ym, 5, 2) - 1] . ' ' . substr($ym, 0, 4);
        }

        return implode(' & ', $out);
    }

    /**
     * @param array<string, string> $vars
     */
    private static function render(string $template, array $vars): string
    {
        return preg_replace_callback('/\{(\w+)\}/', static fn ($m) => array_key_exists($m[1], $vars) ? $vars[$m[1]] : $m[0], $template);
    }

    /**
     * @return array{0: int, 1: int}|null
     */
    private function period(): ?array
    {
        $body  = $this->body();
        $month = filter_var($body['month'] ?? null, FILTER_VALIDATE_INT);
        $year  = filter_var($body['year'] ?? null, FILTER_VALIDATE_INT);

        return ($month !== false && $month >= 0 && $month <= 11 && $year !== false && $year >= 2000 && $year <= 2100) ? [$month, $year] : null;
    }

    /** The app's own origin, as seen by the browser that asked (used in links). */
    private function appOrigin(): string
    {
        foreach ([$this->body()['origin'] ?? null, $this->request->getHeaderLine('Origin')] as $candidate) {
            $parts = parse_url((string) $candidate);
            if (isset($parts['scheme'], $parts['host']) && in_array($parts['scheme'], ['http', 'https'], true)) {
                return $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
            }
        }

        return rtrim((string) config('App')->baseURL, '/');
    }

    /** No salary amounts and no message bodies: who, what, when, result. */
    private function log(string $kind, string $ref, ?string $uid, string $name, array $result): void
    {
        db_connect()->table('wa_logs')->insert([
            'at'         => date('Y-m-d H:i:s'),
            'kind'       => $kind,
            'ref'        => mb_substr($ref, 0, 255),
            'staff_uid'  => $uid,
            'staff_name' => mb_substr($name, 0, 191),
            'status'     => $result['ok'] ? 'sent' : 'failed',
            'reason'     => isset($result['reason']) ? mb_substr($result['reason'], 0, 255) : null,
            'sent_by'    => Auth::user()['username'] ?? '-',
        ]);
    }

    private function notConfigured(): ResponseInterface
    {
        return $this->fail(400, 'failed-precondition', 'WhatsApp belum diatur. Isi API key dan Device ID di Dashboard > Pengaturan WhatsApp.');
    }
}
