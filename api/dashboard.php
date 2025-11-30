<?php
// Dashboard / reservations stub. Replace array data by real SELECT queries when DB schema is ready.

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

session_start();
// If you want to protect stats by login, uncomment the next lines.
// if (!isset($_SESSION['user_id'])) {
//     http_response_code(401);
//     echo json_encode(['error' => 'Connectez-vous pour voir vos emprunts']);
//     exit;
// }

require_once __DIR__ . '/db.php';

try {
    $pdo = get_pdo();
    // TODO: replace the mock data below with real queries, e.g.:
    // $loans = $pdo->prepare('SELECT ... FROM loans WHERE user_id = :uid');
    // $loans->execute([':uid' => $_SESSION['user_id']]);
    // $rows = $loans->fetchAll();
} catch (Throwable $e) {
    // If database is not ready we still return a demo payload.
}

$loans = [
    [
        'id' => 101,
        'name' => 'Oscilloscope Tektronix MDO3024',
        'start' => '2025-12-01',
        'due' => '2025-12-10',
        'status' => 'en cours',
        'progress' => 45,
    ],
    [
        'id' => 102,
        'name' => 'Carte FPGA Artix-7',
        'start' => '2025-12-05',
        'due' => '2025-12-15',
        'status' => 'reserve',
        'progress' => 10,
    ],
];

$stats = [
    'total_year' => count($loans),
    'active' => 1,
    'returned' => max(0, count($loans) - 1),
];

echo json_encode([
    'loans' => $loans,
    'stats' => $stats,
]);

