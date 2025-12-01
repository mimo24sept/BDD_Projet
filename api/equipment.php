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
session_start();

try {
    $pdo = get_pdo();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed', 'details' => $e->getMessage()]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Accès refusé : veuillez vous connecter']);
    exit;
}

if ($method === 'GET') {
    list_equipment($pdo);
    exit;
}

if ($method === 'POST' && $action === 'reserve') {
    reserve_equipment($pdo, (int) $_SESSION['user_id']);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);

function list_equipment(PDO $pdo): void
{
    $stmt = $pdo->query(
        'SELECT
            m.IDmateriel AS id,
            m.NOMmateriel AS name,
            m.Emplacement AS location,
            m.Statut AS statut,
            cat.Categorie AS category,
            inv.Numserie AS numserie,
            inv.Etat AS etat,
            inv.Remarque AS remarque,
            maint.Dateprevu AS maintenance_date,
            maint.Type AS maintenance_type
        FROM `Matériels` m
        LEFT JOIN `Catégorie` cat ON cat.IDcategorie = m.IDcategorie
        LEFT JOIN `Inventaire` inv ON inv.IDmateriel = m.IDmateriel
        LEFT JOIN (
            SELECT IDmateriel, MIN(Dateprevu) AS Dateprevu, GROUP_CONCAT(DISTINCT Type SEPARATOR ", ") AS Type
            FROM maintenance
            GROUP BY IDmateriel
        ) maint ON maint.IDmateriel = m.IDmateriel
        ORDER BY m.IDmateriel DESC'
    );
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $items = [];
    foreach ($rows as $row) {
        $id = (int) ($row['id'] ?? 0);
        if (!isset($items[$id])) {
            $items[$id] = [
                'id' => $id,
                'name' => $row['name'] ?? '',
                'category' => $row['category'] ?? 'Non classé',
                'location' => $row['location'] ?? '',
                'status' => map_status((int) ($row['statut'] ?? 0), $row['maintenance_date'] ?? null),
                'condition' => $row['etat'] ?? '',
                'notes' => $row['remarque'] ?? '',
                'serial' => $row['numserie'] ?? '',
                'tags' => [],
                'maintenance' => $row['maintenance_type'] ?? '',
                'next_service' => $row['maintenance_date'] ?? null,
            ];
        }

        $items[$id]['tags'] = merge_tags(
            $items[$id]['tags'],
            [
                $items[$id]['category'],
                $items[$id]['condition'],
                $items[$id]['maintenance'] ? 'maintenance' : null,
            ]
        );
    }

    echo json_encode(array_values($items));
}

function reserve_equipment(PDO $pdo, int $userId): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $id = isset($data['id']) ? (int) $data['id'] : 0;
    $start = trim((string) ($data['start'] ?? ''));
    if ($start === '') {
        $start = date('Y-m-d');
    }

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Identifiant manquant ou invalide']);
        return;
    }

    $pdo->beginTransaction();
    try {
        $update = $pdo->prepare('UPDATE `Matériels` SET Statut = 0 WHERE IDmateriel = :id');
        $update->execute([':id' => $id]);

        $insert = $pdo->prepare(
            'INSERT INTO `réservation` (IDmateriel, IDuser, Debut, Statut)
             VALUES (:id, :uid, :debut, :statut)'
        );
        $insert->execute([
            ':id' => $id,
            ':uid' => $userId,
            ':debut' => $start,
            ':statut' => 'Confirmé',
        ]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Réservation impossible', 'details' => $e->getMessage()]);
        return;
    }

    $updated = fetch_equipment_by_id($pdo, $id);
    echo json_encode(['status' => 'ok', 'equipment' => $updated]);
}

function fetch_equipment_by_id(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT
            m.IDmateriel AS id,
            m.NOMmateriel AS name,
            m.Emplacement AS location,
            m.Statut AS statut,
            cat.Categorie AS category,
            inv.Numserie AS numserie,
            inv.Etat AS etat,
            inv.Remarque AS remarque,
            maint.Dateprevu AS maintenance_date,
            maint.Type AS maintenance_type
        FROM `Matériels` m
        LEFT JOIN `Catégorie` cat ON cat.IDcategorie = m.IDcategorie
        LEFT JOIN `Inventaire` inv ON inv.IDmateriel = m.IDmateriel
        LEFT JOIN (
            SELECT IDmateriel, MIN(Dateprevu) AS Dateprevu, GROUP_CONCAT(DISTINCT Type SEPARATOR ", ") AS Type
            FROM maintenance
            GROUP BY IDmateriel
        ) maint ON maint.IDmateriel = m.IDmateriel
        WHERE m.IDmateriel = :id
        LIMIT 1'
    );
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return null;
    }

    $mapped = [
        'id' => (int) ($row['id'] ?? 0),
        'name' => $row['name'] ?? '',
        'category' => $row['category'] ?? 'Non classé',
        'location' => $row['location'] ?? '',
        'status' => map_status((int) ($row['statut'] ?? 0), $row['maintenance_date'] ?? null),
        'condition' => $row['etat'] ?? '',
        'notes' => $row['remarque'] ?? '',
        'serial' => $row['numserie'] ?? '',
        'tags' => [],
        'maintenance' => $row['maintenance_type'] ?? '',
        'next_service' => $row['maintenance_date'] ?? null,
    ];

    $mapped['tags'] = merge_tags(
        $mapped['tags'],
        [
            $mapped['category'],
            $mapped['condition'],
            $mapped['maintenance'] ? 'maintenance' : null,
        ]
    );

    return $mapped;
}

function map_status(int $statut, ?string $maintenanceDate): string
{
    if ($maintenanceDate !== null && $maintenanceDate !== '') {
        return 'maintenance';
    }
    return $statut === 1 ? 'disponible' : 'reserve';
}

function merge_tags(array $existing, array $candidates): array
{
    $cleaned = array_filter(array_map(static fn($t) => $t !== null ? strtolower((string) $t) : null, $candidates));
    return array_values(array_unique(array_merge($existing, $cleaned)));
}
