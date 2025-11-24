<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

session_start();
require __DIR__ . '/db.php';

try {
    $pdo = get_pdo();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed', 'details' => $e->getMessage()]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'GET') {
    echo json_encode(current_user());
    exit;
}

if ($method === 'POST' && $action === 'login') {
    login($pdo);
    exit;
}

if ($method === 'POST' && $action === 'logout') {
    logout();
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);

function login(PDO $pdo): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $login = trim($data['login'] ?? '');
    $password = (string) ($data['password'] ?? '');

    if ($login === '' || $password === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Login et mot de passe requis']);
        return;
    }

    $stmt = $pdo->prepare('SELECT id, login, password_hash FROM users WHERE login = :login LIMIT 1');
    $stmt->execute([':login' => $login]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user || !password_verify($password, $user['password_hash'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Identifiants invalides']);
        return;
    }

    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['login'] = $user['login'];

    echo json_encode(current_user());
}

function logout(): void
{
    $_SESSION = [];
    session_destroy();
    echo json_encode(['message' => 'Déconnecté']);
}

function current_user(): ?array
{
    if (!isset($_SESSION['user_id'])) {
        return null;
    }
    return [
        'id' => (int) $_SESSION['user_id'],
        'login' => $_SESSION['login'] ?? '',
    ];
}
