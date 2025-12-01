<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require __DIR__ . '/db.php';

try {
    $pdo = get_pdo();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed', 'details' => $e->getMessage()]);
    exit;
}

$sqlFile = realpath(__DIR__ . '/../BDD/Projet_BDD.sql');
if (!$sqlFile || !is_readable($sqlFile)) {
    http_response_code(500);
    echo json_encode(['error' => 'Le fichier SQL est introuvable', 'path' => $sqlFile]);
    exit;
}

if (table_exists($pdo, 'User')) {
    echo json_encode(['status' => 'ok', 'message' => 'Tables déjà présentes, import non rejoué.']);
    exit;
}

try {
    $sql = file_get_contents($sqlFile);
    $pdo->exec($sql);
    echo json_encode(['status' => 'ok', 'imported' => basename((string) $sqlFile)]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Import SQL échoué', 'details' => $e->getMessage()]);
}

function table_exists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare('SHOW TABLES LIKE :table');
    $stmt->execute([':table' => $table]);
    return (bool) $stmt->fetchColumn();
}
