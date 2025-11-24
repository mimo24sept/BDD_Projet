<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require __DIR__ . '/db.php';
$config = require __DIR__ . '/config.php';

try {
    $pdo = get_pdo();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed', 'details' => $e->getMessage()]);
    exit;
}

$token = extract_bearer_token();
if (!is_valid_token($token, $config['tokens'] ?? [])) {
    http_response_code(401);
    echo json_encode(['error' => 'Accès refusé : token invalide ou manquant']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        list_equipment($pdo);
        break;
    case 'POST':
        create_equipment($pdo);
        break;
    case 'PUT':
        update_equipment($pdo);
        break;
    case 'DELETE':
        delete_equipment($pdo);
        break;
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}

function list_equipment(PDO $pdo): void
{
    $stmt = $pdo->query(
        'SELECT id, name, category, location, status, condition, notes, last_service
         FROM equipment
         ORDER BY id DESC'
    );
    $rows = $stmt->fetchAll();
    echo json_encode($rows);
}

function create_equipment(PDO $pdo): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $name = trim($data['name'] ?? '');
    $category = trim($data['category'] ?? '');
    $location = trim($data['location'] ?? '');
    $status = trim($data['status'] ?? 'disponible');
    $condition = trim($data['condition'] ?? '');
    $notes = trim($data['notes'] ?? '');
    $lastService = $data['last_service'] ?? null;

    if ($name === '' || $category === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Champs requis manquants (name, category)']);
        return;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO equipment (name, category, location, status, condition, notes, last_service)
         VALUES (:name, :category, :location, :status, :condition, :notes, :last_service)'
    );
    $stmt->execute([
        ':name' => $name,
        ':category' => $category,
        ':location' => $location,
        ':status' => $status,
        ':condition' => $condition,
        ':notes' => $notes,
        ':last_service' => $lastService ?: null,
    ]);

    $id = (int) $pdo->lastInsertId();
    $created = fetch_by_id($pdo, $id);
    http_response_code(201);
    echo json_encode($created);
}

function update_equipment(PDO $pdo): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $id = isset($data['id']) ? (int) $data['id'] : 0;

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Identifiant manquant ou invalide']);
        return;
    }

    $stmt = $pdo->prepare(
        'UPDATE equipment
         SET name = COALESCE(:name, name),
             category = COALESCE(:category, category),
             location = COALESCE(:location, location),
             status = COALESCE(:status, status),
             condition = COALESCE(:condition, condition),
             notes = COALESCE(:notes, notes),
             last_service = COALESCE(:last_service, last_service)
         WHERE id = :id'
    );
    $stmt->execute([
        ':id' => $id,
        ':name' => $data['name'] ?? null,
        ':category' => $data['category'] ?? null,
        ':location' => $data['location'] ?? null,
        ':status' => $data['status'] ?? null,
        ':condition' => $data['condition'] ?? null,
        ':notes' => $data['notes'] ?? null,
        ':last_service' => $data['last_service'] ?? null,
    ]);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Equipement introuvable']);
        return;
    }

    $updated = fetch_by_id($pdo, $id);
    if (!$updated) {
        http_response_code(404);
        echo json_encode(['error' => 'Equipement introuvable']);
        return;
    }

    echo json_encode($updated);
}

function delete_equipment(PDO $pdo): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $id = isset($data['id']) ? (int) $data['id'] : 0;

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Identifiant manquant ou invalide']);
        return;
    }

    $stmt = $pdo->prepare('DELETE FROM equipment WHERE id = :id');
    $stmt->execute([':id' => $id]);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Equipement introuvable']);
        return;
    }

    http_response_code(204);
}

function fetch_by_id(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, name, category, location, status, condition, notes, last_service
         FROM equipment WHERE id = :id'
    );
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function extract_bearer_token(): ?string
{
    $header = '';
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (isset($headers['Authorization'])) {
            $header = $headers['Authorization'];
        }
    }
    if (!$header && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $header = $_SERVER['HTTP_AUTHORIZATION'];
    }

    if (preg_match('/Bearer\\s+(.*)/i', $header, $matches)) {
        return trim($matches[1]);
    }
    return null;
}

function is_valid_token(?string $token, array $allowedTokens): bool
{
    if (!$token) {
        return false;
    }
    return in_array($token, $allowedTokens, true);
}
