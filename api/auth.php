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
    echo json_encode(['error' => 'Connexion à la base impossible', 'details' => $e->getMessage()]);
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

    $stmt = $pdo->prepare(
        'SELECT u.IDuser, u.Couriel, u.MDP, u.NOMuser, u.IDrole, r.Role
         FROM `User` u
         LEFT JOIN `Roles` r ON r.IDrole = u.IDrole
         WHERE LOWER(u.Couriel) = LOWER(:loginMail) OR LOWER(u.NOMuser) = LOWER(:loginName)
         LIMIT 1'
    );
    $stmt->execute([':loginMail' => $login, ':loginName' => $login]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user || !is_valid_password($password, (string) $user['MDP'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Identifiants invalides']);
        return;
    }

    $_SESSION['user_id'] = (int) $user['IDuser'];
    $_SESSION['login'] = $user['NOMuser'] ?: $user['Couriel'];
    $_SESSION['role'] = $user['Role'] ?? 'Utilisateur';

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
        'role' => $_SESSION['role'] ?? 'Utilisateur',
    ];
}

function is_valid_password(string $input, string $stored): bool
{
    // Accept either hashed (password_hash) or clear-text values stored in the SQL dump.
    if ($stored === '') {
        return false;
    }
    if (password_verify($input, $stored)) {
        return true;
    }
    return hash_equals($stored, $input);
}
