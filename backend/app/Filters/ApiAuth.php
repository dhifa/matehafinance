<?php

namespace App\Filters;

use App\Libraries\Auth;
use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * Attaches the user behind a bearer token (if any) to the request.
 * Routes that need a signed-in user check Auth::user() themselves, because
 * several endpoints (shared projects, team list) are also open to guests.
 */
class ApiAuth implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        $token = Auth::bearerToken();
        Auth::setUser($token !== null ? Auth::resolveToken($token) : null);

        if ($token !== null && Auth::user() === null) {
            return service('response')
                ->setStatusCode(401)
                ->setJSON(['error' => 'Sesi login berakhir. Silakan login kembali.', 'code' => 'unauthenticated']);
        }

        return null;
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        $response->setHeader('Cache-Control', 'no-store');

        return $response;
    }
}
