<?php

declare(strict_types=1);
// Point d'installation idempotent pour initialiser la base en un appel.

header('Content-Type: application/json; charset=utf-8');

// Connexion centralisee via db.php.
require __DIR__ . '/db.php';

try {
    $pdo = get_pdo();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed', 'details' => $e->getMessage()]);
    exit;
}

// On resolv le chemin pour eviter les chemins relatifs fragiles.
$sqlFile = realpath(__DIR__ . '/../BDD/Projet_BDD.sql');
if (!$sqlFile || !is_readable($sqlFile)) {
    http_response_code(500);
    echo json_encode(['error' => 'Le fichier SQL est introuvable', 'path' => $sqlFile]);
    exit;
}

// Si la base est deja installee, on sort sans reimporter.
if (table_exists($pdo, 'User')) {
    echo json_encode(['status' => 'ok', 'message' => 'Tables déjà présentes, import non rejoué.']);
    exit;
}

try {
    // Import direct du dump SQL pour un setup rapide.
    $sql = file_get_contents($sqlFile);
    $pdo->exec($sql);
    echo json_encode(['status' => 'ok', 'imported' => basename((string) $sqlFile)]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Import SQL échoué', 'details' => $e->getMessage()]);
}

// Verifie l'existence d'une table pour eviter un import en boucle.
function table_exists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare('SHOW TABLES LIKE :table');
    $stmt->execute([':table' => $table]);
    return (bool) $stmt->fetchColumn();
}
