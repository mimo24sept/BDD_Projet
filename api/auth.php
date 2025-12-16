<?php

declare(strict_types=1);
// API Auth : login/logout, inscription, rôles et liste des utilisateurs (admin).

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
    if (($action === 'users') && is_admin()) {
        echo json_encode(list_users($pdo));
        exit;
    }
    echo json_encode(current_user());
    exit;
}

if ($method === 'POST' && $action === 'login') {
    login($pdo);
    exit;
}

if ($method === 'POST' && $action === 'register') {
    register($pdo);
    exit;
}

if ($method === 'POST' && $action === 'set_role') {
    if (!is_admin()) {
        http_response_code(403);
        echo json_encode(['error' => 'Réservé aux administrateurs']);
        exit;
    }
    set_role($pdo);
    exit;
}

if ($method === 'POST' && $action === 'delete_user') {
    if (!is_admin()) {
        http_response_code(403);
        echo json_encode(['error' => 'Réservé aux administrateurs']);
        exit;
    }
    delete_user($pdo);
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
         LEFT JOIN `Role` r ON r.IDrole = u.IDrole
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

    ensure_last_login_column($pdo);

    try {
        $upd = $pdo->prepare('UPDATE `User` SET LastLogin = NOW() WHERE IDuser = :id');
        $upd->execute([':id' => (int) $user['IDuser']]);
    } catch (Throwable $e) {
        // Ignore update failure if column missing.
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

function register(PDO $pdo): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $email = trim((string) ($data['email'] ?? ''));
    $login = trim((string) ($data['login'] ?? ''));
    $password = (string) ($data['password'] ?? '');
    $confirm = (string) ($data['confirm'] ?? '');
    $roleChoice = strtolower(trim((string) ($data['role'] ?? 'etudiant')));
    $profSecret = (string) ($data['secret'] ?? '');

    if ($email === '' || $login === '' || $password === '' || $confirm === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Champs requis manquants']);
        return;
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['error' => 'Email invalide']);
        return;
    }
    if ($password !== $confirm) {
        http_response_code(400);
        echo json_encode(['error' => 'Mots de passe differents']);
        return;
    }

    $isProf = $roleChoice === 'professeur' || $roleChoice === 'prof';
    if ($isProf && $profSecret !== 'truite') {
        http_response_code(403);
        echo json_encode(['error' => 'Mot de passe professeur invalide']);
        return;
    }

    // Unicite email ou login.
    $dupe = $pdo->prepare('SELECT 1 FROM `User` WHERE LOWER(`Couriel`) = LOWER(:mail) OR LOWER(`NOMuser`) = LOWER(:login) LIMIT 1');
    $dupe->execute([':mail' => $email, ':login' => $login]);
    if ($dupe->fetchColumn()) {
        http_response_code(409);
        echo json_encode(['error' => 'Email ou login deja pris']);
        return;
    }

    $roleName = $isProf ? 'Administrateur' : 'Utilisateur';
    $roleId = lookup_role_id($pdo, $roleName, $isProf ? 2 : 1);
    $hash = password_hash($password, PASSWORD_DEFAULT);

    ensure_last_login_column($pdo);

    $insert = $pdo->prepare(
        'INSERT INTO `User` (Couriel, MDP, NOMuser, IDrole, DATEcreation, LastLogin)
         VALUES (:mail, :pwd, :login, :role, CURDATE(), NOW())'
    );
    try {
        $insert->execute([':mail' => $email, ':pwd' => $hash, ':login' => $login, ':role' => $roleId]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Creation impossible', 'details' => $e->getMessage()]);
        return;
    }

    $_SESSION['user_id'] = (int) $pdo->lastInsertId();
    $_SESSION['login'] = $login;
    $_SESSION['role'] = $roleName;

    echo json_encode(current_user());
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

function lookup_role_id(PDO $pdo, string $roleName, int $fallback): int
{
    $stmt = $pdo->prepare('SELECT IDrole FROM `Role` WHERE LOWER(`Role`) = LOWER(:r) LIMIT 1');
    $stmt->execute([':r' => $roleName]);
    $id = (int) ($stmt->fetchColumn() ?: 0);
    return $id > 0 ? $id : $fallback;
}

function list_users(PDO $pdo): array
{
    $hasLast = ensure_last_login_column($pdo);
    $select = 'SELECT u.IDuser AS id, u.Couriel AS email, u.NOMuser AS login, u.DATEcreation AS created, r.Role AS role';
    $select .= $hasLast ? ', u.LastLogin AS last_login' : ', NULL AS last_login';
    $select .= ' FROM `User` u LEFT JOIN `Role` r ON r.IDrole = u.IDrole WHERE r.Role NOT LIKE "%admin%" ORDER BY u.IDuser DESC';
    $stmt = $pdo->query($select);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function normalize_role(string $input): string
{
    $r = strtolower(trim($input));
    if (in_array($r, ['admin', 'administrateur', 'professeur', 'prof'], true)) {
        return 'Administrateur';
    }
    return 'Utilisateur';
}

function set_role(PDO $pdo): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $id = isset($data['id']) ? (int) $data['id'] : 0;
    $roleRaw = (string) ($data['role'] ?? '');
    if ($id <= 0 || $roleRaw === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Parametres invalides']);
        return;
    }

    // Ne pas retirer le rôle admin à un autre admin (sauf si l'utilisateur reste admin).
    $target = fetch_user_with_role($pdo, $id);
    if (!$target) {
        http_response_code(404);
        echo json_encode(['error' => 'Utilisateur introuvable']);
        return;
    }

    $roleName = normalize_role($roleRaw);
    $roleId = lookup_role_id($pdo, $roleName, $roleName === 'Administrateur' ? 2 : 1);

    if (is_role_admin($target['role'] ?? '') && $roleName !== 'Administrateur') {
        http_response_code(403);
        echo json_encode(['error' => 'Impossible de retirer le rôle admin à un administrateur']);
        return;
    }

    $update = $pdo->prepare('UPDATE `User` SET IDrole = :role WHERE IDuser = :id');
    try {
        $update->execute([':role' => $roleId, ':id' => $id]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Mise à jour impossible', 'details' => $e->getMessage()]);
        return;
    }

    echo json_encode(['status' => 'ok', 'role' => $roleName, 'id' => $id]);
}

function delete_user(PDO $pdo): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $id = isset($data['id']) ? (int) $data['id'] : 0;
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Identifiant invalide']);
        return;
    }
    // Récupérer le compte
    $user = fetch_user_with_role($pdo, $id);
    if (!$user) {
        http_response_code(404);
        echo json_encode(['error' => 'Utilisateur introuvable']);
        return;
    }
    // Ne pas supprimer d'admin
    if (is_role_admin((string) ($user['role'] ?? ''))) {
        http_response_code(403);
        echo json_encode(['error' => 'Impossible de supprimer un administrateur']);
        return;
    }

    try {
        $del = $pdo->prepare('DELETE FROM `User` WHERE IDuser = :id');
        $del->execute([':id' => $id]);
        echo json_encode(['status' => 'ok', 'deleted_id' => $id]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Suppression impossible', 'details' => $e->getMessage()]);
    }
}

function fetch_user_with_role(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT u.IDuser AS id, u.Couriel AS email, u.NOMuser AS login, u.DATEcreation AS created, r.Role AS role
         FROM `User` u
         LEFT JOIN `Role` r ON r.IDrole = u.IDrole
         WHERE u.IDuser = :id
         LIMIT 1'
    );
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function is_role_admin(string $role): bool
{
    return stripos($role, 'admin') !== false;
}

function ensure_last_login_column(PDO $pdo): bool
{
    static $checked = false;
    static $has = false;
    if ($checked) {
        return $has;
    }
    $checked = true;
    try {
        $col = $pdo->query("SHOW COLUMNS FROM `User` LIKE 'LastLogin'")->fetch();
        if (!$col) {
            $pdo->exec('ALTER TABLE `User` ADD COLUMN `LastLogin` DATETIME NULL DEFAULT NULL');
        }
        $has = true;
    } catch (Throwable $e) {
        $has = false;
    }
    return $has;
}

function is_admin(): bool
{
    $role = (string) ($_SESSION['role'] ?? '');
    return stripos($role, 'admin') !== false;
}
