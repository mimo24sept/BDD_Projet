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

if ($method === 'POST' && $action === 'create') {
    if (!is_admin()) {
        http_response_code(403);
        echo json_encode(['error' => 'Réservé aux administrateurs']);
        exit;
    }
    create_equipment($pdo);
    exit;
}

if ($method === 'POST' && $action === 'maintenance') {
    if (!is_admin()) {
        http_response_code(403);
        echo json_encode(['error' => 'Réservé aux administrateurs']);
        exit;
    }
    set_maintenance($pdo, (int) $_SESSION['user_id']);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);

function list_equipment(PDO $pdo): void
{
    $activeLoans = fetch_active_loans($pdo);

    $stmt = $pdo->query(
        'SELECT
            m.IDmateriel AS id,
            m.NOMmateriel AS name,
            m.Emplacement AS location,
            m.Dispo AS dispo,
            cat.Categorie AS category,
            m.NUMserie AS numserie,
            m.Etat AS etat
        FROM `Materiel` m
        LEFT JOIN `Categorie` cat ON cat.IDcategorie = m.IDcategorie
        ORDER BY m.IDmateriel DESC'
    );
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $items = [];
    foreach ($rows as $row) {
        $id = (int) ($row['id'] ?? 0);
        $hasMaintenanceAny = !empty($activeLoans[$id]['hasMaintenanceAny']);
        $hasMaintenanceNow = !empty($activeLoans[$id]['hasMaintenanceNow']);
        $hasActiveNow = !empty($activeLoans[$id]['hasActiveNow']);
        if (!isset($items[$id])) {
            $items[$id] = [
                'id' => $id,
                'name' => $row['name'] ?? '',
                'category' => $row['category'] ?? 'Non classé',
                'location' => $row['location'] ?? '',
                'status' => map_status($hasActiveNow, $hasMaintenanceNow),
                'condition' => $row['etat'] ?? '',
                'notes' => '',
                'serial' => $row['numserie'] ?? '',
                'tags' => [],
                'maintenance' => $hasMaintenanceAny,
                'next_service' => null,
                'reservations' => $activeLoans[$id]['periods'] ?? [],
            ];
        }

        $items[$id]['tags'] = merge_tags(
            $items[$id]['tags'],
            [
                $items[$id]['category'],
                $items[$id]['condition'],
                $hasMaintenanceAny ? 'maintenance' : null,
            ]
        );

        if (isset($activeLoans[$id]['weeks'])) {
            $items[$id]['reserved_weeks'] = $activeLoans[$id]['weeks'];
        } else {
            $items[$id]['reserved_weeks'] = [];
        }
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
    $end = trim((string) ($data['end'] ?? ''));
    if ($end === '') {
        $end = $start;
    }

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Identifiant manquant ou invalide']);
        return;
    }
    if (iso_week_key($start) === null || iso_week_key($end) === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Dates invalides']);
        return;
    }
    // Normalize order if end < start.
    if (strtotime($end) !== false && strtotime($start) !== false && strtotime($end) < strtotime($start)) {
        [$start, $end] = [$end, $start];
    }

    // Check overlapping loan for the chosen period (only active loans without return).
    $conflict = $pdo->prepare(
        'SELECT 1
         FROM `Emprunt` e
         WHERE e.IDmateriel = :id
           AND NOT EXISTS (
             SELECT 1 FROM `Rendu` r WHERE r.IDemprunt = e.IDemprunt
           )
           AND e.DATEdebut <= :fin
           AND e.DATEfin >= :debut
         LIMIT 1'
    );
    $conflict->execute([':id' => $id, ':debut' => $start, ':fin' => $end]);
    if ($conflict->fetchColumn()) {
        http_response_code(409);
        echo json_encode(['error' => 'Déjà réservé sur cette période']);
        return;
    }

    $pdo->beginTransaction();
    try {
        $shouldBlockNow = period_is_current($start, $end, date('Y-m-d'));
        if ($shouldBlockNow) {
            $update = $pdo->prepare('UPDATE `Materiel` SET Dispo = "Non" WHERE IDmateriel = :id');
            $update->execute([':id' => $id]);
        }

        $insert = $pdo->prepare(
            'INSERT INTO `Emprunt` (IDmateriel, IDuser, DATEdebut, DATEfin, ETATemprunt)
             VALUES (:id, :uid, :debut, :fin, :etat)'
        );
        $insert->execute([
            ':id' => $id,
            ':uid' => $userId,
            ':debut' => $start,
            ':fin' => $end,
            ':etat' => 'En cours',
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

function set_maintenance(PDO $pdo, int $userId): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $id = isset($data['id']) ? (int) $data['id'] : 0;
    $start = trim((string) ($data['start'] ?? ''));
    if ($start === '') {
        $start = date('Y-m-d');
    }
    $end = trim((string) ($data['end'] ?? ''));
    if ($end === '') {
        $end = $start;
    }

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Identifiant manquant ou invalide']);
        return;
    }
    if (iso_week_key($start) === null || iso_week_key($end) === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Dates invalides']);
        return;
    }
    if (strtotime($end) !== false && strtotime($start) !== false && strtotime($end) < strtotime($start)) {
        [$start, $end] = [$end, $start];
    }

    $conflict = $pdo->prepare(
        'SELECT 1
         FROM `Emprunt` e
         WHERE e.IDmateriel = :id
           AND NOT EXISTS (
             SELECT 1 FROM `Rendu` r WHERE r.IDemprunt = e.IDemprunt
           )
           AND e.DATEdebut <= :fin
           AND e.DATEfin >= :debut
         LIMIT 1'
    );
    $conflict->execute([':id' => $id, ':debut' => $start, ':fin' => $end]);
    if ($conflict->fetchColumn()) {
        http_response_code(409);
        echo json_encode(['error' => 'Déjà indisponible sur cette période']);
        return;
    }

    $pdo->beginTransaction();
    try {
        $shouldBlockNow = period_is_current($start, $end, date('Y-m-d'));
        if ($shouldBlockNow) {
            $update = $pdo->prepare('UPDATE `Materiel` SET Dispo = "Non" WHERE IDmateriel = :id');
            $update->execute([':id' => $id]);
        }

        $insert = $pdo->prepare(
            'INSERT INTO `Emprunt` (IDmateriel, IDuser, DATEdebut, DATEfin, ETATemprunt)
             VALUES (:id, :uid, :debut, :fin, :etat)'
        );
        $insert->execute([
            ':id' => $id,
            ':uid' => $userId,
            ':debut' => $start,
            ':fin' => $end,
            ':etat' => 'Maintenance',
        ]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Planification impossible', 'details' => $e->getMessage()]);
        return;
    }

    $updated = fetch_equipment_by_id($pdo, $id);
    echo json_encode(['status' => 'ok', 'equipment' => $updated]);
}

function create_equipment(PDO $pdo): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $name = trim((string) ($data['name'] ?? ''));
    $categoryName = trim((string) ($data['category'] ?? ''));
    $categoryId = (int) ($data['category_id'] ?? 0);
    $location = trim((string) ($data['location'] ?? ''));
    $serial = trim((string) ($data['serial'] ?? ''));
    $condition = trim((string) ($data['condition'] ?? ''));

    if ($name === '' || ($categoryId <= 0 && $categoryName === '') || $location === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Champs requis manquants (nom, categorie, emplacement)']);
        return;
    }

    try {
        $pdo->beginTransaction();
        if ($categoryId <= 0) {
            $cat = $pdo->prepare('SELECT IDcategorie FROM `Categorie` WHERE LOWER(`Categorie`) = LOWER(:cat) LIMIT 1');
            $cat->execute([':cat' => $categoryName]);
            $categoryId = (int) ($cat->fetchColumn() ?: 0);
            if ($categoryId <= 0) {
                $insCat = $pdo->prepare('INSERT INTO `Categorie` (Categorie) VALUES (:cat)');
                $insCat->execute([':cat' => $categoryName ?: 'Non classe']);
                $categoryId = (int) $pdo->lastInsertId();
            }
        }

        $insert = $pdo->prepare(
            'INSERT INTO `Materiel` (NOMmateriel, IDcategorie, Emplacement, Dispo, NUMserie, Etat)
             VALUES (:name, :cat, :loc, "Oui", :serial, :etat)'
        );
        $insert->execute([
            ':name' => $name,
            ':cat' => $categoryId,
            ':loc' => $location,
            ':serial' => $serial,
            ':etat' => $condition ?: 'Bon',
        ]);
        $newId = (int) $pdo->lastInsertId();
        $pdo->commit();

        $created = fetch_equipment_by_id($pdo, $newId);
        echo json_encode(['status' => 'ok', 'equipment' => $created]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Insertion impossible', 'details' => $e->getMessage()]);
    }
}

function fetch_active_loans(PDO $pdo): array
{
    $today = date('Y-m-d');
    $stmt = $pdo->query(
        'SELECT e.IDmateriel, e.DATEdebut, e.DATEfin, e.ETATemprunt
         FROM `Emprunt` e
         WHERE NOT EXISTS (
            SELECT 1 FROM `Rendu` r WHERE r.IDemprunt = e.IDemprunt
         )'
    );

    $active = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $id = (int) $row['IDmateriel'];
        $start = $row['DATEdebut'] ?? '';
        $end = $row['DATEfin'] ?: $start;
        $weeks = weeks_between($start, $end);
        $kind = strtolower((string) ($row['ETATemprunt'] ?? ''));
        $isCurrent = period_is_current($start, $end, $today);

        $active[$id] ??= [
            'weeks' => [],
            'periods' => [],
            'hasMaintenanceAny' => false,
            'hasMaintenanceNow' => false,
            'hasActiveNow' => false,
        ];

        foreach ($weeks as $week) {
            if (!in_array($week, $active[$id]['weeks'], true)) {
                $active[$id]['weeks'][] = $week;
            }
        }
        $active[$id]['periods'][] = [
            'start' => $start,
            'end' => $end,
            'type' => $kind,
        ];

        if ($isCurrent) {
            $active[$id]['hasActiveNow'] = true;
        }

        if ($kind === 'maintenance') {
            $active[$id]['hasMaintenanceAny'] = true;
            if ($isCurrent) {
                $active[$id]['hasMaintenanceNow'] = true;
            }
        }
    }

    return $active;
}

function fetch_equipment_by_id(PDO $pdo, int $id): ?array
{
    $activeLoans = fetch_active_loans($pdo);
    $stmt = $pdo->prepare(
        'SELECT
            m.IDmateriel AS id,
            m.NOMmateriel AS name,
            m.Emplacement AS location,
            m.Dispo AS dispo,
            cat.Categorie AS category,
            m.NUMserie AS numserie,
            m.Etat AS etat
        FROM `Materiel` m
        LEFT JOIN `Categorie` cat ON cat.IDcategorie = m.IDcategorie
        WHERE m.IDmateriel = :id
        LIMIT 1'
    );
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return null;
    }

    $hasActiveLoan = !empty($activeLoans[$id]['hasActiveNow']);
    $hasMaintenanceAny = !empty($activeLoans[$id]['hasMaintenanceAny']);
    $hasMaintenanceNow = !empty($activeLoans[$id]['hasMaintenanceNow']);
    $mapped = [
        'id' => (int) ($row['id'] ?? 0),
        'name' => $row['name'] ?? '',
        'category' => $row['category'] ?? 'Non classé',
        'location' => $row['location'] ?? '',
        'status' => map_status($hasActiveLoan, $hasMaintenanceNow),
        'condition' => $row['etat'] ?? '',
        'notes' => '',
        'serial' => $row['numserie'] ?? '',
        'tags' => [],
        'maintenance' => $hasMaintenanceAny,
        'next_service' => null,
        'reservations' => $activeLoans[$id]['periods'] ?? [],
    ];

    $mapped['tags'] = merge_tags(
        $mapped['tags'],
        [
            $mapped['category'],
            $mapped['condition'],
            $hasMaintenanceAny ? 'maintenance' : null,
        ]
    );

    $mapped['reserved_weeks'] = $activeLoans[$id]['weeks'] ?? [];

    return $mapped;
}

function map_status(bool $hasActiveLoan, bool $hasMaintenance = false): string
{
    if ($hasMaintenance) {
        return 'maintenance';
    }
    if ($hasActiveLoan) {
        return 'reserve';
    }
    return 'disponible';
}

function merge_tags(array $existing, array $candidates): array
{
    $cleaned = array_filter(array_map(static fn($t) => $t !== null ? strtolower((string) $t) : null, $candidates));
    return array_values(array_unique(array_merge($existing, $cleaned)));
}

function weeks_between(string $start, string $end): array
{
    if ($start === '') {
        return [];
    }
    $weeks = [];
    $startDate = DateTime::createFromFormat('Y-m-d', $start) ?: new DateTime($start);
    $endDate = $end !== '' ? (DateTime::createFromFormat('Y-m-d', $end) ?: new DateTime($end)) : clone $startDate;
    if (!$startDate || !$endDate) {
        return [];
    }
    if ($endDate < $startDate) {
        [$startDate, $endDate] = [$endDate, $startDate];
    }

    $cursor = clone $startDate;
    while ($cursor <= $endDate) {
        $week = iso_week_key($cursor->format('Y-m-d'));
        if ($week !== null && !in_array($week, $weeks, true)) {
            $weeks[] = $week;
        }
        $cursor->modify('+7 days');
    }

    return $weeks;
}

function period_is_current(string $start, string $end, string $today): bool
{
    if ($start === '') {
        return false;
    }
    $startDate = strtotime($start);
    $endDate = strtotime($end !== '' ? $end : $start);
    $todayDate = strtotime($today);

    if ($startDate === false || $endDate === false || $todayDate === false) {
        return false;
    }

    if ($endDate < $startDate) {
        [$startDate, $endDate] = [$endDate, $startDate];
    }

    return $startDate <= $todayDate && $todayDate <= $endDate;
}

function iso_week_key(string $date): ?string
{
    $ts = strtotime($date);
    if ($ts === false) {
        return null;
    }
    $week = (int) date('W', $ts);
    $year = (int) date('o', $ts);
    return sprintf('%04d-W%02d', $year, $week);
}

function is_admin(): bool
{
    $role = (string) ($_SESSION['role'] ?? '');
    return stripos($role, 'admin') !== false;
}
