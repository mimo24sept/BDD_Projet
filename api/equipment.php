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

ensure_material_picture_column($pdo);

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
    if (!is_admin() && !is_technician()) {
        http_response_code(403);
        echo json_encode(['error' => 'Réservé aux administrateurs ou techniciens']);
        exit;
    }
    set_maintenance($pdo, (int) $_SESSION['user_id']);
    exit;
}

if ($method === 'POST' && $action === 'maintenance_decide') {
    if (!is_admin()) {
        http_response_code(403);
        echo json_encode(['error' => 'Réservé aux administrateurs']);
        exit;
    }
    decide_maintenance_request($pdo);
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
            m.Etat AS etat,
            m.Image AS picture
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
                'picture' => $row['picture'] ?? '',
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

    $maxDays = max_reservation_days_for_role((string) ($_SESSION['role'] ?? ''));
    $duration = days_between_inclusive($start, $end);
    if ($duration > $maxDays) {
        http_response_code(400);
        echo json_encode(['error' => 'Durée maximale de ' . $maxDays . ' jours dépassée']);
        return;
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

    if (!is_admin() && !is_technician()) {
        $delayCount = count_user_delays($pdo, $userId);
        if ($delayCount >= 3) {
            $requestId = store_pending_reservation_request($pdo, $id, $userId, $start, $end);
            echo json_encode([
                'status' => 'pending',
                'request_id' => $requestId,
                'message' => 'Demande envoyée pour validation administrateur',
            ]);
            return;
        }
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

    ensure_maintenance_request_table($pdo);

    $pdo->beginTransaction();
    try {
        // Prépare les réservations/emprunts qui chevauchent la maintenance (hors maintenances existantes).
        $overlaps = $pdo->prepare(
            'SELECT e.IDemprunt, e.IDuser, e.DATEdebut, e.DATEfin, m.NOMmateriel
             FROM `Emprunt` e
             LEFT JOIN `Materiel` m ON m.IDmateriel = e.IDmateriel
             WHERE e.IDmateriel = :id
               AND LOWER(e.ETATemprunt) NOT LIKE "maintenance%"
               AND NOT EXISTS (SELECT 1 FROM `Rendu` r WHERE r.IDemprunt = e.IDemprunt)
               AND e.DATEdebut <= :fin
               AND e.DATEfin >= :debut'
        );
        $overlaps->execute([':id' => $id, ':debut' => $start, ':fin' => $end]);
        $toRemove = $overlaps->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($toRemove) && !is_admin()) {
            $requestId = store_pending_maintenance_request($pdo, $id, $userId, $start, $end);
            $pdo->commit();
            echo json_encode([
                'status' => 'pending',
                'request_id' => $requestId,
                'message' => 'Demande envoyée pour validation administrateur',
            ]);
            return;
        }
        if (!empty($toRemove)) {
            adjust_overlapping_reservations($pdo, $toRemove, $start);
        }

        // Vérifie qu'il ne reste pas de maintenance conflictuelle active.
        $conflictMaint = $pdo->prepare(
            'SELECT 1
             FROM `Emprunt` e
             WHERE e.IDmateriel = :id
               AND LOWER(e.ETATemprunt) LIKE "maintenance%"
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

// Valide ou refuse une demande de maintenance (admin).
function decide_maintenance_request(PDO $pdo): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $id = isset($data['id']) ? (int) $data['id'] : 0;
    $decision = strtolower((string) ($data['decision'] ?? ''));
    $decision = in_array($decision, ['approve', 'reject'], true) ? $decision : '';

    if ($id <= 0 || $decision === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Requête invalide']);
        return;
    }

    ensure_maintenance_request_table($pdo);

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'SELECT mr.IDmaintenance, mr.IDmateriel, mr.IDuser, mr.DATEdebut, mr.DATEfin, mr.Status,
                    m.NOMmateriel
             FROM `MaintenanceRequest` mr
             LEFT JOIN `Materiel` m ON m.IDmateriel = mr.IDmateriel
             WHERE mr.IDmaintenance = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['error' => 'Demande introuvable']);
            return;
        }

        $status = strtolower((string) ($row['Status'] ?? ''));
        if ($status !== 'pending') {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['error' => 'Demande déjà traitée']);
            return;
        }

        $materialId = (int) ($row['IDmateriel'] ?? 0);
        $techId = (int) ($row['IDuser'] ?? 0);
        $start = $row['DATEdebut'] ?? '';
        $end = $row['DATEfin'] ?? $start;
        if ($materialId <= 0 || $start === '') {
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode(['error' => 'Demande invalide (données manquantes)']);
            return;
        }

        if ($decision === 'reject') {
            $reject = $pdo->prepare(
                'UPDATE `MaintenanceRequest`
                 SET Status = "rejected"
                 WHERE IDmaintenance = :id'
            );
            $reject->execute([':id' => $id]);
            $pdo->commit();
            echo json_encode(['status' => 'rejected', 'request_id' => $id]);
            return;
        }

        $overlaps = $pdo->prepare(
            'SELECT e.IDemprunt, e.IDuser, e.DATEdebut, e.DATEfin, m.NOMmateriel
             FROM `Emprunt` e
             LEFT JOIN `Materiel` m ON m.IDmateriel = e.IDmateriel
             WHERE e.IDmateriel = :id
               AND LOWER(e.ETATemprunt) NOT LIKE "maintenance%"
               AND NOT EXISTS (SELECT 1 FROM `Rendu` r WHERE r.IDemprunt = e.IDemprunt)
               AND e.DATEdebut <= :fin
               AND e.DATEfin >= :debut'
        );
        $overlaps->execute([':id' => $materialId, ':debut' => $start, ':fin' => $end]);
        $toRemove = $overlaps->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($toRemove)) {
            adjust_overlapping_reservations($pdo, $toRemove, $start);
        }

        $conflictMaint = $pdo->prepare(
            'SELECT 1
             FROM `Emprunt` e
             WHERE e.IDmateriel = :id
               AND LOWER(e.ETATemprunt) LIKE "maintenance%"
               AND NOT EXISTS (SELECT 1 FROM `Rendu` r WHERE r.IDemprunt = e.IDemprunt)
               AND e.DATEdebut <= :fin
               AND e.DATEfin >= :debut
             LIMIT 1'
        );
        $conflictMaint->execute([':id' => $materialId, ':debut' => $start, ':fin' => $end]);
        if ($conflictMaint->fetchColumn()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['error' => 'Maintenance déjà prévue sur cette période']);
            return;
        }

        $shouldBlockNow = period_is_current($start, $end, date('Y-m-d'));
        if ($shouldBlockNow) {
            $update = $pdo->prepare('UPDATE `Materiel` SET Dispo = "Non" WHERE IDmateriel = :id');
            $update->execute([':id' => $materialId]);
        }

        $insert = $pdo->prepare(
            'INSERT INTO `Emprunt` (IDmateriel, IDuser, DATEdebut, DATEfin, ETATemprunt)
             VALUES (:id, :uid, :debut, :fin, :etat)'
        );
        $insert->execute([
            ':id' => $materialId,
            ':uid' => $techId > 0 ? $techId : (int) $_SESSION['user_id'],
            ':debut' => $start,
            ':fin' => $end,
            ':etat' => 'Maintenance',
        ]);

        $markApproved = $pdo->prepare(
            'UPDATE `MaintenanceRequest`
             SET Status = "approved"
             WHERE IDmaintenance = :id'
        );
        $markApproved->execute([':id' => $id]);

        $pdo->commit();

        $updated = fetch_equipment_by_id($pdo, $materialId);
        echo json_encode(['status' => 'approved', 'request_id' => $id, 'equipment' => $updated]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Traitement impossible', 'details' => $e->getMessage()]);
    }
}

// Enregistre ou met à jour une demande de maintenance en attente pour un matériel.
function store_pending_maintenance_request(PDO $pdo, int $materialId, int $userId, string $start, string $end): int
{
    ensure_maintenance_request_table($pdo);
    $existing = $pdo->prepare(
        'SELECT IDmaintenance
         FROM `MaintenanceRequest`
         WHERE IDmateriel = :mid
           AND Status = "pending"
         ORDER BY CreatedAt DESC
         LIMIT 1'
    );
    $existing->execute([':mid' => $materialId]);
    $reqId = (int) ($existing->fetchColumn() ?: 0);

    if ($reqId > 0) {
        $update = $pdo->prepare(
            'UPDATE `MaintenanceRequest`
             SET IDuser = :uid, DATEdebut = :start, DATEfin = :end, Status = "pending", CreatedAt = CURRENT_TIMESTAMP
             WHERE IDmaintenance = :id'
        );
        $update->execute([
            ':uid' => $userId,
            ':start' => $start,
            ':end' => $end,
            ':id' => $reqId,
        ]);
        return $reqId;
    }

    $insert = $pdo->prepare(
        'INSERT INTO `MaintenanceRequest` (IDmateriel, IDuser, DATEdebut, DATEfin, Status)
         VALUES (:mid, :uid, :start, :end, "pending")'
    );
    $insert->execute([
        ':mid' => $materialId,
        ':uid' => $userId,
        ':start' => $start,
        ':end' => $end,
    ]);

    return (int) $pdo->lastInsertId();
}

// Enregistre ou met à jour une demande de réservation en attente.
function store_pending_reservation_request(PDO $pdo, int $materialId, int $userId, string $start, string $end): int
{
    ensure_reservation_request_table($pdo);
    $existing = $pdo->prepare(
        'SELECT IDreservation
         FROM `ReservationRequest`
         WHERE IDmateriel = :mid
           AND IDuser = :uid
           AND Status = "pending"
         ORDER BY CreatedAt DESC
         LIMIT 1'
    );
    $existing->execute([':mid' => $materialId, ':uid' => $userId]);
    $reqId = (int) ($existing->fetchColumn() ?: 0);

    if ($reqId > 0) {
        $update = $pdo->prepare(
            'UPDATE `ReservationRequest`
             SET DATEdebut = :start, DATEfin = :end, Status = "pending", CreatedAt = CURRENT_TIMESTAMP
             WHERE IDreservation = :id'
        );
        $update->execute([
            ':start' => $start,
            ':end' => $end,
            ':id' => $reqId,
        ]);
        return $reqId;
    }

    $insert = $pdo->prepare(
        'INSERT INTO `ReservationRequest` (IDmateriel, IDuser, DATEdebut, DATEfin, Status)
         VALUES (:mid, :uid, :start, :end, "pending")'
    );
    $insert->execute([
        ':mid' => $materialId,
        ':uid' => $userId,
        ':start' => $start,
        ':end' => $end,
    ]);

    return (int) $pdo->lastInsertId();
}

// S'assure de la présence de la table des demandes de maintenance.
function ensure_maintenance_request_table(PDO $pdo): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `MaintenanceRequest` (
            `IDmaintenance` int(11) NOT NULL AUTO_INCREMENT,
            `IDmateriel` int(11) NOT NULL,
            `IDuser` int(11) NOT NULL,
            `DATEdebut` date NOT NULL,
            `DATEfin` date NOT NULL,
            `Status` enum("pending","approved","rejected") NOT NULL DEFAULT "pending",
            `CreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`IDmaintenance`),
            KEY `idx_maint_req_material` (`IDmateriel`),
            KEY `idx_maint_req_user` (`IDuser`),
            CONSTRAINT `fk_maint_req_material` FOREIGN KEY (`IDmateriel`) REFERENCES `Materiel` (`IDmateriel`) ON DELETE CASCADE,
            CONSTRAINT `fk_maint_req_user` FOREIGN KEY (`IDuser`) REFERENCES `User` (`IDuser`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
    );
    $done = true;
}

// S'assure de la présence de la table des demandes de réservation.
function ensure_reservation_request_table(PDO $pdo): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `ReservationRequest` (
            `IDreservation` int(11) NOT NULL AUTO_INCREMENT,
            `IDmateriel` int(11) NOT NULL,
            `IDuser` int(11) NOT NULL,
            `DATEdebut` date NOT NULL,
            `DATEfin` date NOT NULL,
            `Status` enum("pending","approved","rejected") NOT NULL DEFAULT "pending",
            `CreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`IDreservation`),
            KEY `idx_res_req_material` (`IDmateriel`),
            KEY `idx_res_req_user` (`IDuser`),
            CONSTRAINT `fk_res_req_material` FOREIGN KEY (`IDmateriel`) REFERENCES `Materiel` (`IDmateriel`) ON DELETE CASCADE,
            CONSTRAINT `fk_res_req_user` FOREIGN KEY (`IDuser`) REFERENCES `User` (`IDuser`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
    );
    $done = true;
}

// S'assure que la colonne Image existe sur Materiel.
function ensure_material_picture_column(PDO $pdo): bool
{
    static $checked = false;
    static $has = false;
    if ($checked) {
        return $has;
    }
    $checked = true;
    try {
        $col = $pdo->query("SHOW COLUMNS FROM `Materiel` LIKE 'Image'")->fetch();
        if (!$col) {
            $pdo->exec('ALTER TABLE `Materiel` ADD COLUMN `Image` VARCHAR(255) NULL');
        }
        $has = true;
    } catch (Throwable $e) {
        $has = false;
    }
    return $has;
}

// Enregistre une image uploadée et renvoie son chemin public.
function store_uploaded_picture(array $file): string
{
    $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($error === UPLOAD_ERR_NO_FILE) {
        return '';
    }
    if ($error !== UPLOAD_ERR_OK) {
        $messages = [
            UPLOAD_ERR_INI_SIZE => 'Fichier trop volumineux (upload_max_filesize).',
            UPLOAD_ERR_FORM_SIZE => 'Fichier trop volumineux.',
            UPLOAD_ERR_PARTIAL => 'Upload incomplet.',
            UPLOAD_ERR_NO_TMP_DIR => 'Dossier temporaire manquant.',
            UPLOAD_ERR_CANT_WRITE => 'Ecriture du fichier impossible.',
            UPLOAD_ERR_EXTENSION => 'Upload bloque par une extension PHP.',
        ];
        $message = $messages[$error] ?? 'Upload image impossible';
        throw new RuntimeException($message);
    }
    $size = (int) ($file['size'] ?? 0);
    if ($size <= 0) {
        throw new RuntimeException('Fichier image invalide');
    }
    if ($size > 4 * 1024 * 1024) {
        throw new RuntimeException('Image trop lourde (4 Mo max)');
    }

    $mime = '';
    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string) $finfo->file((string) ($file['tmp_name'] ?? ''));
    }
    if ($mime === '' && function_exists('getimagesize')) {
        $info = @getimagesize((string) ($file['tmp_name'] ?? ''));
        $mime = is_array($info) ? (string) ($info['mime'] ?? '') : '';
    }

    $allowed = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];
    if (!isset($allowed[$mime])) {
        throw new RuntimeException('Format d\'image non supporté');
    }

    $uploadDir = __DIR__ . '/../assets/uploads';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
        throw new RuntimeException('Impossible de créer le dossier upload');
    }

    $suffix = bin2hex(random_bytes(4));
    $filename = sprintf('materiel-%s-%s.%s', date('Ymd-His'), $suffix, $allowed[$mime]);
    $target = $uploadDir . '/' . $filename;
    if (!move_uploaded_file((string) ($file['tmp_name'] ?? ''), $target)) {
        throw new RuntimeException('Enregistrement image impossible');
    }

    return 'assets/uploads/' . $filename;
}

// Crée un nouvel équipement dans la base (admin).
function create_equipment(PDO $pdo): void
{
    $contentType = (string) ($_SERVER['CONTENT_TYPE'] ?? '');
    if (str_contains($contentType, 'multipart/form-data') || !empty($_POST) || !empty($_FILES)) {
        $data = $_POST;
    } else {
        $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    }
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
    $picturePath = '';
    if (!empty($_FILES['picture']) && is_array($_FILES['picture'])) {
        try {
            $picturePath = store_uploaded_picture($_FILES['picture']);
        } catch (Throwable $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
            return;
        }
    }

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
            'INSERT INTO `Materiel` (NOMmateriel, IDcategorie, Emplacement, Dispo, NUMserie, Etat, Image)
             VALUES (:name, :cat, :loc, "Oui", :serial, :etat, :image)'
        );
        $insert->execute([
            ':name' => $name,
            ':cat' => $categoryId,
            ':loc' => $location,
            ':serial' => $serial,
            ':etat' => $condition ?: 'Bon',
            ':image' => $picturePath !== '' ? $picturePath : null,
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

        if (str_contains($kind, 'maintenance')) {
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
            m.Etat AS etat,
            m.Image AS picture
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
        'picture' => $row['picture'] ?? '',
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

// Indique si l'utilisateur en session est technicien.
function is_technician(): bool
{
    $role = strtolower((string) ($_SESSION['role'] ?? ''));
    return str_contains($role, 'technicien');
}

// Indique si l'utilisateur en session est professeur.
function is_professor(): bool
{
    $role = strtolower((string) ($_SESSION['role'] ?? ''));
    return str_contains($role, 'professeur');
}

// Raccourcit ou annule les réservations chevauchées par une maintenance et notifie l'utilisateur.
function adjust_overlapping_reservations(PDO $pdo, array $overlaps, string $maintenanceStart): void
{
    $cutoffTs = strtotime($maintenanceStart . ' -1 day');
    $updateEnd = $pdo->prepare('UPDATE `Emprunt` SET DATEfin = :fin WHERE IDemprunt = :eid');
    $delRendu = $pdo->prepare('DELETE FROM `Rendu` WHERE IDemprunt = :eid');
    $delLoan = $pdo->prepare('DELETE FROM `Emprunt` WHERE IDemprunt = :eid');
    foreach ($overlaps as $row) {
        $eid = (int) ($row['IDemprunt'] ?? 0);
        $userIdReservation = (int) ($row['IDuser'] ?? 0);
        $startStr = $row['DATEdebut'] ?? '';
        $endStr = $row['DATEfin'] ?? $startStr;
        $materialName = trim((string) ($row['NOMmateriel'] ?? ''));
        $materialLabel = $materialName !== '' ? $materialName : 'le matériel';
        $startTs = strtotime($startStr);
        $newEnd = ($cutoffTs !== false) ? date('Y-m-d', $cutoffTs) : $endStr;
        $canShorten = $startTs !== false && $cutoffTs !== false && $startTs <= $cutoffTs;

        if ($canShorten) {
            $updateEnd->execute([':fin' => $newEnd, ':eid' => $eid]);
            if ($userIdReservation > 0) {
                $message = sprintf(
                    'Votre réservation pour %s est écourtée : elle se terminera le %s en raison d’une maintenance.',
                    $materialLabel,
                    format_date_fr($newEnd)
                );
                enqueue_notification($pdo, $userIdReservation, $message);
            }
        } else {
            $delRendu->execute([':eid' => $eid]);
            $delLoan->execute([':eid' => $eid]);
            if ($userIdReservation > 0) {
                $message = sprintf(
                    'Votre réservation du %s au %s pour %s a été annulée suite à une maintenance planifiée.',
                    format_date_fr($startStr),
                    format_date_fr($endStr),
                    $materialLabel
                );
                enqueue_notification($pdo, $userIdReservation, $message);
            }
        }
    }
}

// Compte les retards d'un utilisateur (retours tardifs ou prêts non rendus en retard).
function count_user_delays(PDO $pdo, int $userId): int
{
    if ($userId <= 0) {
        return 0;
    }
    $today = date('Y-m-d');
    $stmt = $pdo->prepare(
        'SELECT e.DATEfin, r.DATErendu, e.ETATemprunt
         FROM `Emprunt` e
         LEFT JOIN `Rendu` r ON r.IDemprunt = e.IDemprunt
         WHERE e.IDuser = :uid'
    );
    $stmt->execute([':uid' => $userId]);
    $delays = 0;
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $kind = strtolower((string) ($row['ETATemprunt'] ?? ''));
        if (str_contains($kind, 'maintenance')) {
            continue;
        }
        $due = $row['DATEfin'] ?? null;
        $returned = $row['DATErendu'] ?? null;
        if ($due === null) {
            continue;
        }
        $dueTs = strtotime($due);
        $returnedTs = $returned ? strtotime($returned) : false;
        $isDelay = false;
        if ($returnedTs !== false && $dueTs !== false && $returnedTs > $dueTs) {
            $isDelay = true;
        } elseif ($returnedTs === false && $dueTs !== false && strtotime($today) > $dueTs) {
            $isDelay = true;
        }
        if ($isDelay) {
            $delays += 1;
        }
    }
    return $delays;
}

// Retourne la durée max autorisée pour une réservation selon le rôle.
function max_reservation_days_for_role(string $role): int
{
    $role = strtolower(trim($role));
    if (str_contains($role, 'prof')) {
        return 21;
    }
    return 14;
}

// Nombre de jours (inclus) entre deux dates AAAA-MM-JJ.
function days_between_inclusive(string $start, string $end): int
{
    $startTs = strtotime($start);
    $endTs = strtotime($end);
    if ($startTs === false || $endTs === false) {
        return 0;
    }
    if ($endTs < $startTs) {
        [$startTs, $endTs] = [$endTs, $startTs];
    }
    return (int) floor(($endTs - $startTs) / 86400) + 1;
}
