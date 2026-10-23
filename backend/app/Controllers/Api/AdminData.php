<?php

namespace App\Controllers\Api;

use App\Libraries\Auth;
use App\Libraries\BackupImporter;
use App\Libraries\SqlExporter;
use CodeIgniter\HTTP\ResponseInterface;
use InvalidArgumentException;
use Throwable;

/**
 * Admin database tools on the dashboard:
 *
 *   POST /api/admin/import-json {backup: {...}, overwrite?: bool}  import a JSON backup
 *   GET  /api/admin/export-sql                                     download a MySQL dump
 */
class AdminData extends BaseApiController
{
    public function importJson(): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }

        $body = $this->body();
        if (! is_array($body['backup'] ?? null)) {
            return $this->fail(400, 'invalid-argument', 'File backup kosong atau bukan JSON yang valid.');
        }

        try {
            return $this->ok(BackupImporter::import($body['backup'], ! empty($body['overwrite'])));
        } catch (InvalidArgumentException $e) {
            return $this->fail(400, 'invalid-argument', $e->getMessage());
        } catch (Throwable $e) {
            log_message('error', '[Import JSON] {message}', ['message' => $e->getMessage()]);

            return $this->fail(500, 'internal', 'Impor gagal, semua perubahan dibatalkan: ' . $e->getMessage());
        }
    }

    public function exportSql(): ResponseInterface
    {
        if (! Auth::isAdmin()) {
            return $this->denied();
        }

        @set_time_limit(120);
        $dump = SqlExporter::dump();

        return $this->response
            ->setHeader('Content-Type', 'application/sql; charset=utf-8')
            ->setHeader('Content-Disposition', 'attachment; filename="mateha_database_' . date('Y-m-d') . '.sql"')
            ->setHeader('Cache-Control', 'no-store')
            ->setBody($dump['sql']);
    }
}
