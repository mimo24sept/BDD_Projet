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

// Traite la connexion d'un utilisateur (vérifie identifiants et session).
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
        // Permet de tracer la dernière connexion ; ignore si la colonne manque.
        $upd = $pdo->prepare('UPDATE `User` SET LastLogin = NOW() WHERE IDuser = :id');
        $upd->execute([':id' => (int) $user['IDuser']]);
    } catch (Throwable $e) {
    }

    $_SESSION['user_id'] = (int) $user['IDuser'];
    $_SESSION['login'] = $user['NOMuser'] ?: $user['Couriel'];
    $_SESSION['role'] = $user['Role'] ?? 'Eleve';

    echo json_encode(current_user());
}

// Déconnecte l'utilisateur courant et détruit la session.
function logout(): void
{
    $_SESSION = [];
    session_destroy();
    echo json_encode(['message' => 'Déconnecté']);
}

// Inscrit un nouvel utilisateur (avec rôles multiples) et ouvre la session.
function register(PDO $pdo): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $email = trim((string) ($data['email'] ?? ''));
    $login = trim((string) ($data['login'] ?? ''));
    $password = (string) ($data['password'] ?? '');
    $confirm = (string) ($data['confirm'] ?? '');
    $roleChoice = strtolower(trim((string) ($data['role'] ?? 'eleve')));
    $secret = (string) ($data['secret'] ?? '');

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

    $roleName = normalize_role_label($roleChoice);
    if ($roleName === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Rôle invalide']);
        return;
    }
    $needsSecret = in_array($roleName, ['Professeur', 'Technicien', 'Administrateur'], true);
    $expectedSecret = $roleName === 'Professeur' ? 'prof' : ($roleName === 'Technicien' ? 'tech' : 'admin');
    if ($needsSecret && $secret !== $expectedSecret) {
        http_response_code(403);
        echo json_encode(['error' => 'Mot de passe secret invalide']);
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

    $fallbackId = match ($roleName) {
        'Administrateur' => 4,
        'Professeur' => 2,
        'Technicien' => 3,
        default => 1,
    };
    $roleId = lookup_role_id($pdo, $roleName, $fallbackId);
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

// Retourne l'utilisateur courant en session (ou null).
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

// Vérifie un mot de passe (hashé ou en clair issu du dump).
function is_valid_password(string $input, string $stored): bool
{
    // Accepte aussi bien les mots de passe hashés que les valeurs en clair issues du dump SQL.
    if ($stored === '') {
        return false;
    }
    if (password_verify($input, $stored)) {
        return true;
    }
    return hash_equals($stored, $input);
}

// Récupère l'ID du rôle demandé ou un fallback.
function lookup_role_id(PDO $pdo, string $roleName, int $fallback): int
{
    $stmt = $pdo->prepare('SELECT IDrole FROM `Role` WHERE LOWER(`Role`) = LOWER(:r) LIMIT 1');
    $stmt->execute([':r' => $roleName]);
    $id = (int) ($stmt->fetchColumn() ?: 0);
    return $id > 0 ? $id : $fallback;
}

// Retourne la liste des utilisateurs (hors admins).
function list_users(PDO $pdo): array
{
    $hasLast = ensure_last_login_column($pdo);
    $select = 'SELECT u.IDuser AS id, u.Couriel AS email, u.NOMuser AS login, u.DATEcreation AS created, r.Role AS role';
    $select .= $hasLast ? ', u.LastLogin AS last_login' : ', NULL AS last_login';
    $select .= ' FROM `User` u LEFT JOIN `Role` r ON r.IDrole = u.IDrole WHERE LOWER(r.Role) NOT LIKE "%admin%" ORDER BY u.IDuser DESC';
    $stmt = $pdo->query($select);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

// Normalise un rôle fourni vers un libellé connu.
function normalize_role(string $input): string
{
    return normalize_role_label($input) ?: 'Eleve';
}

// Retourne un libellé de rôle propre ou chaîne vide si inconnu.
function normalize_role_label(string $input): string
{
    $r = strtolower(trim($input));
    return match (true) {
        in_array($r, ['admin', 'administrateur'], true) => 'Administrateur',
        in_array($r, ['technicien', 'tech'], true) => 'Technicien',
        in_array($r, ['prof', 'professeur'], true) => 'Professeur',
        in_array($r, ['eleve', 'etudiant', 'utilisateur'], true) => 'Eleve',
        default => '',
    };
}

// Met à jour le rôle d'un utilisateur (contrôles inclus).
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
    $fallbackId = match ($roleName) {
        'Administrateur' => 4,
        'Professeur' => 2,
        'Technicien' => 3,
        default => 1,
    };
    $roleId = lookup_role_id($pdo, $roleName, $fallbackId);

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

// Supprime un utilisateur (sauf administrateur).
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

// Récupère un utilisateur avec son rôle à partir de son ID.
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

// Vérifie si un libellé de rôle contient "admin".
function is_role_admin(string $role): bool
{
    return stripos($role, 'admin') !== false;
}

// S'assure que la colonne LastLogin existe, la crée si besoin.
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

// Vérifie si l'utilisateur en session est admin.
function is_admin(): bool
{
    return is_role_admin((string) ($_SESSION['role'] ?? ''));
}

// Indique si l'utilisateur courant est technicien.
function is_technician(): bool
{
    $role = strtolower((string) ($_SESSION['role'] ?? ''));
    return str_contains($role, 'technicien');
}
