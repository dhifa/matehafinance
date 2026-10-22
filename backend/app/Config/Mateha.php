<?php

namespace Config;

use CodeIgniter\Config\BaseConfig;

/**
 * Application settings for the Mateha finance API.
 *
 * Every Firestore collection the frontend used maps to its own MySQL table.
 * Documents are stored as JSON in `data`; fields that are queried or used for
 * permission checks are copied into indexed columns ("indexes": jsonField => column).
 */
class Mateha extends BaseConfig
{
    /**
     * @var array<string, array{table: string, indexes: array<string, string>}>
     */
    public array $collections = [
        'projects'        => ['table' => 'projects', 'indexes' => ['isPublic' => 'is_public', 'ownerId' => 'owner_id']],
        'users'           => ['table' => 'users', 'indexes' => ['username' => 'username', 'email' => 'email', 'role' => 'role', 'status' => 'status']],
        'settings'        => ['table' => 'settings', 'indexes' => []],
        'payslips'        => ['table' => 'payslips', 'indexes' => ['staffUsername' => 'staff_username']],
        'kasbon_requests' => ['table' => 'kasbon_requests', 'indexes' => ['staffUid' => 'staff_uid', 'staffUsername' => 'staff_username', 'status' => 'status']],
        'invoices'        => ['table' => 'invoices', 'indexes' => []],
        'quotations'      => ['table' => 'quotations', 'indexes' => []],
        'kwitansi'        => ['table' => 'kwitansi', 'indexes' => []],
        'clients'         => ['table' => 'clients', 'indexes' => []],
        'banks'           => ['table' => 'banks', 'indexes' => []],
        'shared-payslips' => ['table' => 'shared_payslips', 'indexes' => []],
    ];

    /**
     * Emails that are always treated as administrators (kept from the original app).
     * Any email starting with "admin@" is also an administrator.
     *
     * @var list<string>
     */
    public array $ownerEmails = ['dhifahermawan@gmail.com'];

    /** Domain used for staff accounts that log in with a plain username. */
    public string $localEmailDomain = 'mateha.local';

    /** Lifetime of an API token, in seconds (default 30 days). */
    public int $tokenTtl = 2592000;

    /** Maximum failed logins per IP address per minute. */
    public int $loginAttemptsPerMinute = 10;

    /** Gemini models tried in order; overridable with `mateha.geminiModels` in .env (comma separated). */
    public string $geminiModels = 'gemini-flash-latest,gemini-3.7-flash,gemini-3.1-flash-lite,gemini-3.1-pro-preview';

    public string $geminiApiKey = '';

    public function __construct()
    {
        parent::__construct();

        // Accept the same variable name the Node server used
        if ($this->geminiApiKey === '') {
            $this->geminiApiKey = trim((string) (getenv('GEMINI_API_KEY') ?: ''));
        }
        // Ignore placeholders such as "isi_api_key_gemini_anda"; real Gemini keys are ~39 characters
        if (! preg_match('/^[A-Za-z0-9_\-.]{30,300}$/', $this->geminiApiKey)) {
            $this->geminiApiKey = '';
        }
    }
}
