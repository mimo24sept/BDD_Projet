<?php

declare(strict_types=1);
// API Equipement : catalogue, réservations, créations/suppressions et maintenance.

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

if ($method === 'POST' && $action === 'delete') {
    if (!is_admin()) {
        http_response_code(403);
        echo json_encode(['error' => 'Réservé aux administrateurs']);
        exit;
    }
    delete_equipment($pdo);
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

// Liste le matériel avec statut (dispo/maintenance) et plages occupées.
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
        $categories = normalize_categories($row['category'] ?? '');
        if (!isset($items[$id])) {
            $items[$id] = [
                'id' => $id,
                'name' => $row['name'] ?? '',
                'category' => $row['category'] ?? 'Non classé',
                'categories' => $categories,
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
            ...$categories,
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

// Crée une réservation pour un matériel : vérifie conflits, dates valides et non-passé.
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
        echo json_encode(['error' => 'Déjà réservé sur cette période']);
        return;
    }
    $today = date('Y-m-d');
    if ($start < $today) {
        http_response_code(400);
        echo json_encode(['error' => 'Impossible de réserver dans le passé']);
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

// Planifie une maintenance sur un matériel (et annule les réservations chevauchantes).
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

    $pdo->beginTransaction();
    try {
        // Supprime les réservations/emprunts qui chevauchent la maintenance (hors maintenances existantes).
        $overlaps = $pdo->prepare(
            'SELECT e.IDemprunt, e.IDuser, e.DATEdebut, e.DATEfin, m.NOMmateriel
             FROM `Emprunt` e
             LEFT JOIN `Materiel` m ON m.IDmateriel = e.IDmateriel
             WHERE e.IDmateriel = :id
               AND LOWER(e.ETATemprunt) <> "maintenance"
               AND NOT EXISTS (SELECT 1 FROM `Rendu` r WHERE r.IDemprunt = e.IDemprunt)
               AND e.DATEdebut <= :fin
               AND e.DATEfin >= :debut'
        );
        $overlaps->execute([':id' => $id, ':debut' => $start, ':fin' => $end]);
        $toRemove = $overlaps->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($toRemove)) {
            $delRendu = $pdo->prepare('DELETE FROM `Rendu` WHERE IDemprunt = :eid');
            $del = $pdo->prepare('DELETE FROM `Emprunt` WHERE IDemprunt = :eid');
            foreach ($toRemove as $row) {
                $eid = (int) ($row['IDemprunt'] ?? 0);
                $delRendu->execute([':eid' => $eid]);
                $del->execute([':eid' => $eid]);
                $userIdReservation = (int) ($row['IDuser'] ?? 0);
                if ($userIdReservation > 0) {
                    $startStr = $row['DATEdebut'] ?? '';
                    $endStr = $row['DATEfin'] ?? $startStr;
                    $materialName = trim((string) ($row['NOMmateriel'] ?? ''));
                    $message = sprintf(
                        'Votre réservation du %s au %s pour %s a été annulée suite à une maintenance planifiée.',
                        format_date_fr($startStr),
                        format_date_fr($endStr),
                        $materialName !== '' ? $materialName : 'le matériel'
                    );
                    enqueue_notification($pdo, $userIdReservation, $message);
                }
            }
        }

        // Vérifie qu'il ne reste pas de maintenance conflictuelle active.
        $conflictMaint = $pdo->prepare(
            'SELECT 1
             FROM `Emprunt` e
             WHERE e.IDmateriel = :id
               AND LOWER(e.ETATemprunt) = "maintenance"
               AND NOT EXISTS (SELECT 1 FROM `Rendu` r WHERE r.IDemprunt = e.IDemprunt)
               AND e.DATEdebut <= :fin
               AND e.DATEfin >= :debut
             LIMIT 1'
        );
        $conflictMaint->execute([':id' => $id, ':debut' => $start, ':fin' => $end]);
        if ($conflictMaint->fetchColumn()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['error' => 'Maintenance déjà prévue sur cette période']);
            return;
        }

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

// Crée un nouvel équipement dans la base (admin).
function create_equipment(PDO $pdo): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $name = trim((string) ($data['name'] ?? ''));
    $payloadCategories = $data['categories'] ?? [];
    $categories = [];
    if (is_array($payloadCategories)) {
        foreach ($payloadCategories as $cat) {
            $cat = ucfirst(strtolower(trim((string) $cat)));
            if ($cat !== '') {
                $categories[] = $cat;
            }
        }
    } elseif (is_string($payloadCategories) && trim($payloadCategories) !== '') {
        $categories = normalize_categories($payloadCategories);
    }
    $categories = array_values(array_unique($categories));
    $allowedCategories = ['Info', 'Elen', 'Ener', 'Auto'];
    $categories = array_values(array_filter(
        $categories,
        static fn($c) => in_array($c, $allowedCategories, true)
    ));
    $categoryName = implode(', ', $categories);
    $categoryId = (int) ($data['category_id'] ?? 0);
    $location = trim((string) ($data['location'] ?? ''));
    $condition = ucfirst(strtolower(trim((string) ($data['condition'] ?? ''))));

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

        $serial = generate_reference($pdo, $name, $categories ?: [$categoryName]);

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

// Supprime un équipement (admin) et renvoie les stats mises à jour.
function delete_equipment(PDO $pdo): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $id = isset($data['id']) ? (int) $data['id'] : 0;
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Identifiant manquant ou invalide']);
        return;
    }

    $active = $pdo->prepare(
        'SELECT 1
         FROM `Emprunt` e
         WHERE e.IDmateriel = :id
           AND NOT EXISTS (
             SELECT 1 FROM `Rendu` r WHERE r.IDemprunt = e.IDemprunt
           )
         LIMIT 1'
    );
    $active->execute([':id' => $id]);
    if ($active->fetchColumn()) {
        http_response_code(409);
        echo json_encode(['error' => 'Impossible de supprimer : emprunt ou réservation active']);
        return;
    }

    try {
        $pdo->beginTransaction();
        $delReturns = $pdo->prepare(
            'DELETE r FROM `Rendu` r
             JOIN `Emprunt` e ON e.IDemprunt = r.IDemprunt
             WHERE e.IDmateriel = :id'
        );
        $delReturns->execute([':id' => $id]);

        $delLoans = $pdo->prepare('DELETE FROM `Emprunt` WHERE IDmateriel = :id');
        $delLoans->execute([':id' => $id]);

        $delMat = $pdo->prepare('DELETE FROM `Materiel` WHERE IDmateriel = :id');
        $delMat->execute([':id' => $id]);

        if ($delMat->rowCount() === 0) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['error' => 'Matériel introuvable']);
            return;
        }

        $pdo->commit();
        echo json_encode(['status' => 'ok']);
    } catch (Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Suppression impossible', 'details' => $e->getMessage()]);
    }
}

// Récupère les prêts/maintenances en cours pour chaque matériel.
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

// Récupère un équipement par ID, avec info de maintenance.
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

    $categories = normalize_categories($row['category'] ?? '');
    $hasActiveLoan = !empty($activeLoans[$id]['hasActiveNow']);
    $hasMaintenanceAny = !empty($activeLoans[$id]['hasMaintenanceAny']);
    $hasMaintenanceNow = !empty($activeLoans[$id]['hasMaintenanceNow']);
    $mapped = [
        'id' => (int) ($row['id'] ?? 0),
        'name' => $row['name'] ?? '',
        'category' => $row['category'] ?? 'Non classé',
        'categories' => $categories,
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
            ...$categories,
            $mapped['condition'],
            $hasMaintenanceAny ? 'maintenance' : null,
        ]
    );

    $mapped['reserved_weeks'] = $activeLoans[$id]['weeks'] ?? [];

    return $mapped;
}

// Convertit les états d'activité/maintenance en statut lisible.
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

// Fusionne et déduplique deux listes de tags.
function merge_tags(array $existing, array $candidates): array
{
    $cleaned = array_filter(array_map(static fn($t) => $t !== null ? strtolower((string) $t) : null, $candidates));
    return array_values(array_unique(array_merge($existing, $cleaned)));
}

// Décompose/normalise une chaîne de catégories en tableau.
function normalize_categories(string $value): array
{
    $parts = array_map(
        static fn($c) => ucfirst(strtolower(trim((string) $c))),
        preg_split('/[,;]+/', $value) ?: []
    );
    return array_values(array_filter(array_unique($parts), static fn($c) => $c !== ''));
}

// Génère une référence unique pour un matériel.
function generate_reference(PDO $pdo, string $name, array $categories = []): string
{
    // Base : 3 premières lettres du nom (translittérées), complétées en X si besoin.
    $base = build_reference_prefix($name);

    // Cherche les références existantes qui partagent ce préfixe.
    $stmt = $pdo->prepare('SELECT `NUMserie` FROM `Materiel` WHERE `NUMserie` LIKE :pfx');
    $stmt->execute([':pfx' => $base . '%']);
    $max = 0;
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $ref) {
        if (preg_match('/^' . preg_quote($base, '/') . '-?(\\d+)$/i', (string) $ref, $m)) {
            $num = (int) $m[1];
            if ($num > $max) {
                $max = $num;
            }
        }
    }

    $next = $max + 1;
    return sprintf('%s-%03d', $base, $next);
}

// Construit le préfixe de référence à partir du nom.
function build_reference_prefix(string $name): string
{
    $asciiName = transliterate_to_ascii($name);
    // Garde uniquement les lettres (insensible à la casse), puis majuscule.
    $lettersOnly = preg_replace('/[^A-Za-z]/', '', $asciiName);
    $clean = strtoupper($lettersOnly ?? '');
    if ($clean === '') {
        $clean = 'MAT';
    }
    $base = substr($clean, 0, 3);
    if (strlen($base) < 3) {
        $base = str_pad($base, 3, 'X');
    }
    return $base;
}

// Translitère une chaîne en ASCII (sans accents).
function transliterate_to_ascii(string $value): string
{
    $map = [
        'À' => 'A', 'Â' => 'A', 'Ä' => 'A', 'Á' => 'A', 'Ã' => 'A', 'Å' => 'A', 'Æ' => 'AE',
        'Ç' => 'C',
        'È' => 'E', 'É' => 'E', 'Ê' => 'E', 'Ë' => 'E',
        'Ì' => 'I', 'Í' => 'I', 'Î' => 'I', 'Ï' => 'I',
        'Ñ' => 'N',
        'Ò' => 'O', 'Ó' => 'O', 'Ô' => 'O', 'Ö' => 'O', 'Õ' => 'O',
        'Ù' => 'U', 'Ú' => 'U', 'Û' => 'U', 'Ü' => 'U',
        'Ý' => 'Y',
        'à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'ã' => 'a', 'å' => 'a', 'æ' => 'ae',
        'ç' => 'c',
        'è' => 'e', 'é' => 'e', 'ê' => 'e', 'ë' => 'e',
        'ì' => 'i', 'í' => 'i', 'î' => 'i', 'ï' => 'i',
        'ñ' => 'n',
        'ò' => 'o', 'ó' => 'o', 'ô' => 'o', 'ö' => 'o', 'õ' => 'o',
        'ù' => 'u', 'ú' => 'u', 'û' => 'u', 'ü' => 'u',
        'ý' => 'y', 'ÿ' => 'y',
    ];

    $ascii = function_exists('iconv')
        ? @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value)
        : $value;
    if ($ascii === false || $ascii === null || $ascii === '') {
        $ascii = $value;
    }
    return strtr($ascii, $map);
}

// Liste les numéros de semaines entre deux dates.
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

// Vérifie si une période englobe la date du jour.
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

// Retourne la clé ISO de semaine pour une date.
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

// Enregistre une notification côté base pour informer l'utilisateur concerné.
function enqueue_notification(PDO $pdo, int $userId, string $message): void
{
    if ($userId <= 0 || trim($message) === '') {
        return;
    }
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO `Notification` (IDuser, Message)
             VALUES (:uid, :msg)'
        );
        $stmt->execute([':uid' => $userId, ':msg' => $message]);
    } catch (Throwable $e) {
        error_log('Notification insert failed: ' . $e->getMessage());
    }
}

// Formate une date AAAA-MM-JJ en JJ/MM/AAAA (fallback brut si invalide).
function format_date_fr(?string $date): string
{
    $ts = $date ? strtotime($date) : false;
    if ($ts === false) {
        return (string) ($date ?? '');
    }
    return date('d/m/Y', $ts);
}

// Indique si l'utilisateur en session est admin.
function is_admin(): bool
{
    $role = (string) ($_SESSION['role'] ?? '');
    return stripos($role, 'admin') !== false;
}
