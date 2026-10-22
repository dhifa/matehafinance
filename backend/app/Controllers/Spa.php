<?php

namespace App\Controllers;

use CodeIgniter\HTTP\ResponseInterface;

/**
 * Serves the built React app (copied into public/ by `npm run build:backend`)
 * for every non-API route, so deep links and ?shareProject= URLs work.
 */
class Spa extends BaseController
{
    public function index(): ResponseInterface
    {
        $file = FCPATH . 'app.html';

        if (! is_file($file)) {
            return $this->response->setStatusCode(503)->setBody(
                'Frontend belum di-build. Jalankan "npm run build:backend" di folder proyek, lalu muat ulang halaman ini.'
            );
        }

        return $this->response
            ->setHeader('Content-Type', 'text/html; charset=UTF-8')
            ->setHeader('Cache-Control', 'no-cache')
            ->setBody((string) file_get_contents($file));
    }
}
