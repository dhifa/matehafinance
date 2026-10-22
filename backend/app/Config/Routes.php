<?php

use CodeIgniter\Router\RouteCollection;

/** @var RouteCollection $routes */
$routes->group('api', ['namespace' => 'App\Controllers\Api', 'filter' => ['cors', 'apiauth']], static function (RouteCollection $routes): void {
    $routes->get('health', static fn () => service('response')->setJSON(['status' => 'ok', 'time' => date('c')]));

    $routes->post('auth/login', 'AuthController::login');
    $routes->post('auth/logout', 'AuthController::logout');
    $routes->get('auth/me', 'AuthController::me');
    $routes->post('auth/change-password', 'AuthController::changePassword');

    $routes->post('admin/users', 'AdminUsers::create');
    $routes->get('admin/settings/ai', 'AdminSettings::ai');
    $routes->put('admin/settings/ai', 'AdminSettings::saveAi');
    $routes->delete('admin/settings/ai', 'AdminSettings::deleteAi');
    $routes->post('admin/settings/ai/test', 'AdminSettings::testAi');

    $routes->post('gemini/parse-rab', 'Gemini::parseRab');
    $routes->post('gemini/parse-receipt', 'Gemini::parseReceipt');

    $routes->get('collections/(:segment)', 'Collections::index/$1');
    $routes->post('collections/(:segment)', 'Collections::create/$1');
    $routes->get('collections/(:segment)/(:segment)', 'Collections::show/$1/$2');
    $routes->put('collections/(:segment)/(:segment)', 'Collections::put/$1/$2');
    $routes->patch('collections/(:segment)/(:segment)', 'Collections::patch/$1/$2');
    $routes->delete('collections/(:segment)/(:segment)', 'Collections::delete/$1/$2');

    $routes->options('(:any)', static fn () => service('response')->setStatusCode(204));
});

// Everything else is the React single-page app
$routes->get('/', 'Spa::index');
$routes->get('(:any)', 'Spa::index');
