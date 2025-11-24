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

$pdo->exec(
    'CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        login VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;'
);

$pdo->exec(
    'CREATE TABLE IF NOT EXISTS equipment (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        location TEXT NULL,
        status TEXT DEFAULT "disponible",
        `condition` TEXT NULL,
        notes TEXT NULL,
        last_service DATE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;'
);

// Create a default user if none exists.
$stmt = $pdo->query('SELECT COUNT(*) AS count FROM users');
$count = (int) $stmt->fetchColumn();
if ($count === 0) {
    $insert = $pdo->prepare('INSERT INTO users (login, password_hash) VALUES (:login, :password_hash)');
    $insert->execute([
        ':login' => 'admin',
        ':password_hash' => password_hash('admin', PASSWORD_DEFAULT),
    ]);
    $createdUser = ['login' => 'admin', 'password' => 'admin'];
} else {
    $createdUser = null;
}

echo json_encode([
    'status' => 'ok',
    'default_user' => $createdUser,
]);
