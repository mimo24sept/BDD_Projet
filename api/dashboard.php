<?php
declare(strict_types=1);
// API Tableau de bord : emprunts utilisateur/admin, rendus, annulations et stats.

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

session_start();

require_once __DIR__ . '/db.php';

try {
    $pdo = get_pdo();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Connexion à la base impossible', 'details' => $e->getMessage()]);
    exit;
}

ensure_prolongation_table($pdo);
ensure_maintenance_request_table($pdo);

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Connectez-vous pour voir vos emprunts']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'GET' && $action === 'admin_stats') {
    if (!is_admin() && !is_technician()) {
        http_response_code(403);
        echo json_encode(['error' => 'Réservé aux administrateurs ou techniciens']);
        exit;
    }
    try {
        $stats = build_admin_stats($pdo);
        echo json_encode($stats);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Stats indisponibles', 'details' => $e->getMessage()]);
    }
    exit;
}

if ($method === 'POST' && $action === 'return') {
    if (!is_admin() && !is_technician()) {
        http_response_code(403);
        echo json_encode(['error' => 'Retour réservé aux administrateurs ou techniciens']);
        exit;
    }
    return_pret($pdo, (int) $_SESSION['user_id']);
    exit;
}

if ($method === 'POST' && $action === 'admin_cancel') {
    if (!is_admin()) {
        http_response_code(403);
        echo json_encode(['error' => 'Réservé aux administrateurs']);
        exit;
    }
    admin_cancel($pdo);
    exit;
}

if ($method === 'POST' && $action === 'cancel_request') {
    request_cancel($pdo, (int) $_SESSION['user_id']);
    exit;
}

if ($method === 'POST' && $action === 'extend_request') {
    request_extension($pdo, (int) $_SESSION['user_id']);
    exit;
}

if ($method === 'POST' && $action === 'extend_decide') {
    if (!is_admin()) {
        http_response_code(403);
        echo json_encode(['error' => 'Réservé aux administrateurs']);
        exit;
    }
    decide_extension($pdo);
    exit;
}

try {
    $scope = $_GET['scope'] ?? 'mine';
    $targetUser = ($scope === 'all' && (is_admin() || is_technician())) ? null : (int) $_SESSION['user_id'];
    $loans = fetch_loans($pdo, $targetUser);
    $stats = build_stats($loans);
    $notifications = consume_notifications($pdo, (int) $_SESSION['user_id']);
    $maintenanceRequests = (is_admin() || is_technician())
        ? fetch_maintenance_requests($pdo, $scope === 'all' ? null : (int) $_SESSION['user_id'])
        : [];
    echo json_encode([
        'loans' => $loans,
        'stats' => $stats,
        'notifications' => $notifications,
        'maintenance_requests' => $maintenanceRequests,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Lecture des données impossible', 'details' => $e->getMessage()]);
}

// Récupère la liste des emprunts (optionnellement filtrés par utilisateur).
function fetch_loans(PDO $pdo, ?int $userId): array
{
    $loans = [];

    $where = $userId !== null ? 'WHERE e.IDuser = :uid' : '';
    $sql = "SELECT e.IDemprunt, e.DATEdebut, e.DATEfin, e.ETATemprunt,
                   m.NOMmateriel, m.Emplacement, m.IDmateriel, m.Etat AS EtatMateriel,
                   r.DATErendu, r.ETATrendu,
                   u.NOMuser
            FROM `Emprunt` e
            LEFT JOIN `Materiel` m ON m.IDmateriel = e.IDmateriel
            LEFT JOIN `Rendu` r ON r.IDemprunt = e.IDemprunt
            LEFT JOIN `User` u ON u.IDuser = e.IDuser
            $where";
    $emprunt = $pdo->prepare($sql);
    if ($userId !== null) {
        $emprunt->execute([':uid' => $userId]);
    } else {
        $emprunt->execute();
    }
    foreach ($emprunt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $start = $row['DATEdebut'] ?? null;
        $due = $row['DATEfin'] ?? null;
        $returnedAt = $row['DATErendu'] ?? null;
        $kind = strtolower((string) ($row['ETATemprunt'] ?? ''));
        $returnState = $row['ETATrendu'] ?? '';
        $type = is_maintenance_kind($kind) ? 'maintenance' : 'pret';
        $status = $returnedAt ? 'rendu' : ($kind ?: 'en cours');
        $extension = fetch_extension_for_loan($pdo, (int) $row['IDemprunt']);
        $loans[] = [
            'id' => (int) $row['IDemprunt'],
            'type' => $type,
            'name' => $row['NOMmateriel'] ?? 'Matériel supprimé',
            'material_id' => isset($row['IDmateriel']) ? (int) $row['IDmateriel'] : null,
            'start' => $start ?: compute_start_date($due),
            'due' => $due,
            'status' => $status,
            'progress' => progress_percent($start ?: compute_start_date($due), $due),
            'user' => $row['NOMuser'] ?? '',
            'condition' => $row['EtatMateriel'] ?? '',
            'returned' => $returnedAt,
            'return_state' => $returnState,
            'extension' => $extension,
        ];
    }

    usort($loans, static fn($a, $b) => strcmp($a['due'] ?? '', $b['due'] ?? ''));
    return $loans;
}

// Calcule une date de début par défaut (7 jours avant la fin) si absente.
function compute_start_date(?string $due): ?string
{
    if (!$due) {
        return null;
    }
    $dueTs = strtotime($due);
    if ($dueTs === false) {
        return null;
    }
    return date('Y-m-d', strtotime('-7 days', $dueTs));
}

// Calcule l'avancement d'un prêt en pourcentage.
function progress_percent(?string $start, ?string $due): int
{
    if (!$start || !$due) {
        return 0;
    }
    $startTs = strtotime($start);
    $dueTs = strtotime($due);
    if ($startTs === false || $dueTs === false || $dueTs <= $startTs) {
        return 0;
    }
    $total = $dueTs - $startTs;
    $elapsed = time() - $startTs;
    $ratio = max(0, min(1, $elapsed / $total));
    return (int) round($ratio * 100);
}

// Construit les statistiques utilisateur et l'historique associé.
function build_stats(array $loans): array
{
    $today = date('Y-m-d');
    $todayTs = strtotime($today);
    $year = (int) date('Y');
    $eligible = array_filter($loans, static fn($l) => ($l['type'] ?? 'pret') !== 'maintenance');

    $history = [];
    $totalYear = 0;
    $delays = 0;
    $degrades = 0;

    foreach ($eligible as $loan) {
        $start = $loan['start'] ?? null;
        $due = $loan['due'] ?? null;
        $returned = $loan['returned'] ?? null;
        $returnState = $loan['return_state'] ?? '';

        $startYear = null;
        if ($start) {
            $startTs = strtotime($start);
            if ($startTs !== false) {
                $startYear = (int) date('Y', $startTs);
            }
        }

        $dueTs = $due ? strtotime($due) : false;
        $returnedTs = $returned ? strtotime($returned) : false;
        $isDelay = false;
        if ($dueTs !== false) {
            if (($returnedTs !== false && $returnedTs > $dueTs) || ($returnedTs === false && $todayTs !== false && $dueTs < $todayTs)) {
                $isDelay = true;
            }
        }

        $isDegrade = $returnState !== '' && is_degradation($returnState);

        if ($startYear === $year) {
            $totalYear += 1;
            if ($isDelay) {
                $delays += 1;
            }
            if ($isDegrade) {
                $degrades += 1;
            }
        }

        $history[] = [
            'id' => $loan['id'] ?? null,
            'name' => $loan['name'] ?? '',
            'start' => $start,
            'due' => $due,
            'returned' => $returned,
            'status' => $loan['status'] ?? '',
            'return_state' => $returnState,
            'is_delay' => $isDelay,
            'is_degrade' => $isDegrade,
            'type' => $loan['type'] ?? 'pret',
        ];
    }

    usort($history, static function ($a, $b) {
        return strcmp($b['start'] ?? '', $a['start'] ?? '');
    });

    $returnedCount = count(array_filter($eligible, static fn($l) => ($l['status'] ?? '') === 'rendu'));
    $active = max(0, count($eligible) - $returnedCount);

    return [
        'total_year' => $totalYear,
        'active' => $active,
        'returned' => $returnedCount,
        'delays' => $delays,
        'degrades' => $degrades,
        'history' => $history,
    ];
}

// Construit les statistiques globales côté administrateur.
function build_admin_stats(PDO $pdo): array
{
    $year = (int) date('Y');
    $today = date('Y-m-d');
    $stmt = $pdo->prepare(
        'SELECT e.DATEdebut, e.DATEfin, e.ETATemprunt, r.DATErendu, r.ETATrendu,
                m.NOMmateriel, u.NOMuser
         FROM `Emprunt` e
         JOIN `Materiel` m ON m.IDmateriel = e.IDmateriel
         LEFT JOIN `Rendu` r ON r.IDemprunt = e.IDemprunt
         LEFT JOIN `User` u ON u.IDuser = e.IDuser
         WHERE YEAR(e.DATEdebut) = :y'
    );
    $stmt->execute([':y' => $year]);

    $total = 0;
    $delays = 0;
    $degrades = 0;
    $maints = 0;
    $history = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $kind = strtolower((string) ($row['ETATemprunt'] ?? ''));
        $isMaintenance = is_maintenance_kind($kind);
        $returned = $row['DATErendu'] ?? null;
        if ($isMaintenance) {
            if ($returned) {
                $maints += 1;
            }
        } else {
            $total += 1;
        }
        $start = $row['DATEdebut'] ?? null;
        $due = $row['DATEfin'] ?? null;
        $etatRendu = $row['ETATrendu'] ?? '';
        $isDelay = false;
        if ($due) {
            if ($returned && strtotime($returned) > strtotime($due)) {
                $isDelay = true;
                if (!$isMaintenance) {
                    $delays += 1;
                }
            } elseif (!$returned && strtotime($due) < strtotime($today)) {
                $isDelay = true;
                if (!$isMaintenance) {
                    $delays += 1;
                }
            }
        }
        $isDegrade = $etatRendu && is_degradation($etatRendu);
        if ($isDegrade && !$isMaintenance) {
            $degrades += 1;
        }

        $history[] = [
          'name' => $row['NOMmateriel'] ?? '',
          'start' => $start,
          'due' => $due,
          'returned' => $returned,
          'user' => $row['NOMuser'] ?? '',
          'status' => $row['ETATemprunt'] ?? '',
          'return_state' => $etatRendu,
          'is_delay' => $isDelay,
          'is_degrade' => $isDegrade,
          'is_maint' => $isMaintenance,
        ];
    }

    return [
        'total_year' => $total,
        'delays' => $delays,
        'degrades' => $degrades,
        'maints' => $maints,
        'history' => $history,
    ];
}

// S'assure que la table des prolongations existe (création lazy si absente).
function ensure_prolongation_table(PDO $pdo): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `Prolongation` (
            `IDprolongation` int(11) NOT NULL AUTO_INCREMENT,
            `IDemprunt` int(11) NOT NULL,
            `DATEfinDemande` date NOT NULL,
            `Status` enum("pending","approved","rejected") NOT NULL DEFAULT "pending",
            `CreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`IDprolongation`),
            KEY `idx_prolongation_emprunt` (`IDemprunt`),
            CONSTRAINT `fk_prolongation_emprunt` FOREIGN KEY (`IDemprunt`) REFERENCES `Emprunt` (`IDemprunt`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
    );
    $done = true;
}

// Récupère la dernière demande de prolongation associée à un prêt.
function fetch_extension_for_loan(PDO $pdo, int $loanId): ?array
{
    if ($loanId <= 0) {
        return null;
    }
    try {
        $stmt = $pdo->prepare(
            'SELECT DATEfinDemande, Status, CreatedAt
             FROM `Prolongation`
             WHERE IDemprunt = :id
             ORDER BY CreatedAt DESC, IDprolongation DESC
             LIMIT 1'
        );
        $stmt->execute([':id' => $loanId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }
        return [
            'requested_due' => $row['DATEfinDemande'] ?? '',
            'status' => $row['Status'] ?? '',
            'created_at' => $row['CreatedAt'] ?? '',
        ];
    } catch (Throwable $e) {
        return null;
    }
}

// S'assure que la table des demandes de maintenance existe.
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
            CONSTRAINT `fk_maint_req_material_dash` FOREIGN KEY (`IDmateriel`) REFERENCES `Materiel` (`IDmateriel`) ON DELETE CASCADE,
            CONSTRAINT `fk_maint_req_user_dash` FOREIGN KEY (`IDuser`) REFERENCES `User` (`IDuser`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
    );
    $done = true;
}

// Récupère les demandes de maintenance en attente (optionnellement filtrées par demandeur).
function fetch_maintenance_requests(PDO $pdo, ?int $userId): array
{
    ensure_maintenance_request_table($pdo);
    $where = 'WHERE mr.Status = "pending"';
    $params = [];
    if ($userId !== null) {
        $where .= ' AND mr.IDuser = :uid';
        $params[':uid'] = $userId;
    }
    $stmt = $pdo->prepare(
        "SELECT mr.IDmaintenance AS id, mr.IDmateriel, mr.IDuser, mr.DATEdebut, mr.DATEfin, mr.Status,
                m.NOMmateriel, u.NOMuser
         FROM `MaintenanceRequest` mr
         LEFT JOIN `Materiel` m ON m.IDmateriel = mr.IDmateriel
         LEFT JOIN `User` u ON u.IDuser = mr.IDuser
         $where
         ORDER BY mr.CreatedAt DESC"
    );
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return array_map(
        static fn($row) => [
            'id' => (int) ($row['id'] ?? 0),
            'material_id' => (int) ($row['IDmateriel'] ?? 0),
            'start' => $row['DATEdebut'] ?? '',
            'due' => $row['DATEfin'] ?? ($row['DATEdebut'] ?? ''),
            'status' => $row['Status'] ?? '',
            'name' => $row['NOMmateriel'] ?? '',
            'requested_by' => $row['NOMuser'] ?? '',
            'requested_by_id' => (int) ($row['IDuser'] ?? 0),
            'type' => 'maintenance_request',
            'progress' => 0,
        ],
        $rows ?: []
    );
}

// Marque un prêt comme rendu : contrôle accès, insère le rendu, met à jour l'état matériel et la disponibilité.
function return_pret(PDO $pdo, int $userId): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $id = isset($data['id']) ? (int) $data['id'] : 0;
    $condition = strtolower(trim((string) ($data['condition'] ?? '')));
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Identifiant invalide']);
        return;
    }
    $allowed = ['neuf', 'bon', 'passable', 'reparation nécessaire', 'reparation necessaire'];
    if ($condition !== '' && !in_array($condition, $allowed, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Etat invalide']);
        return;
    }

    $pdo->beginTransaction();
    try {
        $select = $pdo->prepare(
            'SELECT IDmateriel, ETATemprunt
             FROM `Emprunt`
             WHERE IDemprunt = :id
               AND (:uid = IDuser OR :isAdmin = 1 OR :isTech = 1)
             LIMIT 1'
        );
        $select->execute([
            ':id' => $id,
            ':uid' => $userId,
            ':isAdmin' => is_admin() ? 1 : 0,
            ':isTech' => is_technician() ? 1 : 0,
        ]);
        $row = $select->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['error' => 'Prêt introuvable']);
            return;
        }
        $materielId = (int) $row['IDmateriel'];
        $isMaintenanceLoan = is_maintenance_kind((string) ($row['ETATemprunt'] ?? ''));
        if (is_technician() && !$isMaintenanceLoan) {
            $pdo->rollBack();
            http_response_code(403);
            echo json_encode(['error' => 'Un technicien ne peut clôturer que les maintenances']);
            return;
        }

        $alreadyReturned = $pdo->prepare('SELECT 1 FROM `Rendu` WHERE IDemprunt = :id LIMIT 1');
        $alreadyReturned->execute([':id' => $id]);
        if ($alreadyReturned->fetchColumn()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['error' => 'Déjà rendu']);
            return;
        }

        $newStatus = $isMaintenanceLoan ? 'Maintenance terminee' : 'Terminé';
        $updatePret = $pdo->prepare(
            'UPDATE `Emprunt`
             SET ETATemprunt = :etat
             WHERE IDemprunt = :id'
        );
        $updatePret->execute([':id' => $id, ':etat' => $newStatus]);

        $currentMat = $pdo->prepare('SELECT Etat FROM `Materiel` WHERE IDmateriel = :mid LIMIT 1');
        $currentMat->execute([':mid' => $materielId]);
        $prevCondition = strtolower((string) ($currentMat->fetchColumn() ?: 'bon'));

        $condition = $isMaintenanceLoan ? 'bon' : ($condition !== '' ? $condition : $prevCondition);
        $condition = normalize_condition($condition);
        $prevConditionNorm = normalize_condition($prevCondition);

        if (!$isMaintenanceLoan && condition_rank($condition) > condition_rank($prevConditionNorm)) {
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode(['error' => 'Impossible d’améliorer l’état par rapport à l’emprunt']);
            return;
        }

        $updateMat = $pdo->prepare('UPDATE `Materiel` SET Dispo = "Oui", Etat = :etat WHERE IDmateriel = :mid');
        $updateMat->execute([':mid' => $materielId, ':etat' => $condition]);

        $afterLabel = $condition !== '' ? $condition : 'Rendu';
        $beforeLabel = $prevConditionNorm ?: 'inconnu';
        $isDegrade = condition_rank($afterLabel) < condition_rank($beforeLabel);

        $insertRendu = $pdo->prepare(
            'INSERT INTO `Rendu` (IDemprunt, DATErendu, ETATrendu)
             VALUES (:id, CURDATE(), :etat)'
        );
        $insertRendu->execute([':id' => $id, ':etat' => $isDegrade ? 'degrade:' . $beforeLabel . '->' . $afterLabel : $afterLabel]);

        $pdo->commit();
        echo json_encode(['status' => 'ok', 'returned_id' => $id]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Retour impossible', 'details' => $e->getMessage()]);
    }
}

// Demande d'annulation initiée par un utilisateur (ou admin) en marquant l'emprunt.
function request_cancel(PDO $pdo, int $userId): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $id = isset($data['id']) ? (int) $data['id'] : 0;
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Identifiant invalide']);
        return;
    }

    $pdo->beginTransaction();
    try {
        $select = $pdo->prepare(
            'SELECT IDemprunt FROM `Emprunt`
             WHERE IDemprunt = :id
               AND (:uid = IDuser OR :isAdmin = 1)
             LIMIT 1'
        );
        $select->execute([':id' => $id, ':uid' => $userId, ':isAdmin' => is_admin() ? 1 : 0]);
        $row = $select->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['error' => 'Réservation introuvable']);
            return;
        }

        $alreadyReturned = $pdo->prepare('SELECT 1 FROM `Rendu` WHERE IDemprunt = :id LIMIT 1');
        $alreadyReturned->execute([':id' => $id]);
        if ($alreadyReturned->fetchColumn()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['error' => 'Déjà rendu']);
            return;
        }

        $update = $pdo->prepare(
            'UPDATE `Emprunt`
             SET ETATemprunt = "Annulation demandee"
             WHERE IDemprunt = :id'
        );
        $update->execute([':id' => $id]);

        $pdo->commit();
        echo json_encode(['status' => 'ok']);
    } catch (Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Impossible de demander l\'annulation', 'details' => $e->getMessage()]);
    }
}

// Demande de prolongation initiée par un utilisateur (soumise à validation admin).
function request_extension(PDO $pdo, int $userId): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $id = isset($data['id']) ? (int) $data['id'] : 0;
    $requested = normalize_date_input((string) ($data['new_due'] ?? ''));

    if ($id <= 0 || $requested === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Identifiant ou date invalide']);
        return;
    }

    $pdo->beginTransaction();
    try {
        $select = $pdo->prepare(
            'SELECT IDmateriel, IDuser, DATEdebut, DATEfin, ETATemprunt
             FROM `Emprunt`
             WHERE IDemprunt = :id
             LIMIT 1'
        );
        $select->execute([':id' => $id]);
        $row = $select->fetch(PDO::FETCH_ASSOC);
        if (!$row || ((int) ($row['IDuser'] ?? 0) !== $userId && !is_admin())) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['error' => 'Prêt introuvable']);
            return;
        }

        $alreadyReturned = $pdo->prepare('SELECT 1 FROM `Rendu` WHERE IDemprunt = :id LIMIT 1');
        $alreadyReturned->execute([':id' => $id]);
        if ($alreadyReturned->fetchColumn()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['error' => 'Déjà rendu']);
            return;
        }

        $status = strtolower((string) ($row['ETATemprunt'] ?? ''));
        if (is_maintenance_kind($status)) {
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode(['error' => 'Prolongation impossible sur une maintenance']);
            return;
        }
        if ($status === 'annulation demandee') {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['error' => 'Annulation en cours : prolongation impossible']);
            return;
        }

        $start = $row['DATEdebut'] ?? '';
        $due = $row['DATEfin'] ?? $start;
        $borrowerRole = fetch_user_role($pdo, (int) ($row['IDuser'] ?? 0));
        $maxDays = max_reservation_days_for_role($borrowerRole);
        if ($start === '' || $due === '' || $requested === null) {
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode(['error' => 'Dates manquantes ou invalides']);
            return;
        }
        if (strtotime($requested) <= strtotime($due)) {
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode(['error' => 'La nouvelle date doit dépasser la date actuelle']);
            return;
        }
        if ($requested < date('Y-m-d')) {
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode(['error' => 'Impossible de prolonger dans le passé']);
            return;
        }
        $duration = days_between_inclusive($start, $requested);
        if ($duration > $maxDays) {
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode(['error' => 'Durée maximale de ' . $maxDays . ' jours dépassée']);
            return;
        }

        $conflict = $pdo->prepare(
            'SELECT 1
             FROM `Emprunt` e
             WHERE e.IDmateriel = :mid
               AND e.IDemprunt <> :id
               AND NOT EXISTS (SELECT 1 FROM `Rendu` r WHERE r.IDemprunt = e.IDemprunt)
               AND e.DATEdebut <= :newEnd
               AND e.DATEfin >= :start
             LIMIT 1'
        );
        $conflict->execute([
            ':mid' => (int) ($row['IDmateriel'] ?? 0),
            ':id' => $id,
            ':newEnd' => $requested,
            ':start' => $start,
        ]);
        if ($conflict->fetchColumn()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['error' => 'Déjà réservé sur la période demandée']);
            return;
        }

        $existing = $pdo->prepare(
            'SELECT IDprolongation
             FROM `Prolongation`
             WHERE IDemprunt = :id AND Status = "pending"
             ORDER BY CreatedAt DESC
             LIMIT 1'
        );
        $existing->execute([':id' => $id]);
        $pendingId = (int) ($existing->fetchColumn() ?: 0);

        if ($pendingId > 0) {
            $update = $pdo->prepare(
                'UPDATE `Prolongation`
                 SET DATEfinDemande = :due, Status = "pending", CreatedAt = CURRENT_TIMESTAMP
                 WHERE IDprolongation = :pid'
            );
            $update->execute([':due' => $requested, ':pid' => $pendingId]);
        } else {
            $insert = $pdo->prepare(
                'INSERT INTO `Prolongation` (IDemprunt, DATEfinDemande, Status)
                 VALUES (:id, :due, "pending")'
            );
            $insert->execute([':id' => $id, ':due' => $requested]);
        }

        $pdo->commit();
        echo json_encode(['status' => 'ok', 'requested_due' => $requested]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Impossible de demander la prolongation', 'details' => $e->getMessage()]);
    }
}

// Annulation directe d'une réservation par un administrateur (suppression + remise dispo si besoin).
function admin_cancel(PDO $pdo): void
{
    $data = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $id = isset($data['id']) ? (int) $data['id'] : 0;
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Identifiant invalide']);
        return;
    }

    $pdo->beginTransaction();
    try {
        $select = $pdo->prepare(
            'SELECT e.IDmateriel, e.IDuser, e.DATEdebut, e.DATEfin, m.NOMmateriel
             FROM `Emprunt` e
             LEFT JOIN `Materiel` m ON m.IDmateriel = e.IDmateriel
             WHERE e.IDemprunt = :id
             LIMIT 1'
        );
        $select->execute([':id' => $id]);
        $row = $select->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['error' => 'Réservation introuvable']);
            return;
        }

        $alreadyReturned = $pdo->prepare('SELECT 1 FROM `Rendu` WHERE IDemprunt = :id LIMIT 1');
        $alreadyReturned->execute([':id' => $id]);
        if ($alreadyReturned->fetchColumn()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['error' => 'Déjà rendu']);
            return;
        }

        $delete = $pdo->prepare('DELETE FROM `Emprunt` WHERE IDemprunt = :id');
        $delete->execute([':id' => $id]);

        $materielId = (int) ($row['IDmateriel'] ?? 0);
        if ($materielId > 0) {
            $hasActive = $pdo->prepare(
                'SELECT 1
                 FROM `Emprunt` e
                 WHERE e.IDmateriel = :mid
                   AND e.DATEdebut <= CURDATE()
                   AND e.DATEfin >= CURDATE()
                   AND NOT EXISTS (SELECT 1 FROM `Rendu` r WHERE r.IDemprunt = e.IDemprunt)
                 LIMIT 1'
            );
            $hasActive->execute([':mid' => $materielId]);
            if (!$hasActive->fetchColumn()) {
                $updateMat = $pdo->prepare('UPDATE `Materiel` SET Dispo = "Oui" WHERE IDmateriel = :mid');
                $updateMat->execute([':mid' => $materielId]);
            }
        }

        $userId = (int) ($row['IDuser'] ?? 0);
        if ($userId > 0) {
            $materialName = trim((string) ($row['NOMmateriel'] ?? ''));
            $start = $row['DATEdebut'] ?? '';
            $end = $row['DATEfin'] ?? $start;
            $message = sprintf(
                'Votre réservation du %s au %s pour %s a été annulée par un administrateur.',
                format_date_fr($start),
                format_date_fr($end),
                $materialName !== '' ? $materialName : 'le matériel'
            );
            enqueue_notification($pdo, $userId, $message);
        }

        $pdo->commit();
        echo json_encode(['status' => 'ok', 'canceled_id' => $id]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Annulation admin impossible', 'details' => $e->getMessage()]);
    }
}

// Validation/refus d'une prolongation par un administrateur (met à jour la date de fin du prêt).
function decide_extension(PDO $pdo): void
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

    $pdo->beginTransaction();
    try {
        $pending = $pdo->prepare(
            'SELECT IDprolongation, DATEfinDemande
             FROM `Prolongation`
             WHERE IDemprunt = :id AND Status = "pending"
             ORDER BY CreatedAt DESC, IDprolongation DESC
             LIMIT 1'
        );
        $pending->execute([':id' => $id]);
        $req = $pending->fetch(PDO::FETCH_ASSOC);
        if (!$req) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['error' => 'Aucune prolongation en attente']);
            return;
        }

        $loanStmt = $pdo->prepare(
            'SELECT e.IDmateriel, e.IDuser, e.DATEdebut, e.DATEfin, e.ETATemprunt, m.NOMmateriel, r.Role
             FROM `Emprunt` e
             LEFT JOIN `Materiel` m ON m.IDmateriel = e.IDmateriel
             LEFT JOIN `User` u ON u.IDuser = e.IDuser
             LEFT JOIN `Role` r ON r.IDrole = u.IDrole
             WHERE e.IDemprunt = :id
             LIMIT 1'
        );
        $loanStmt->execute([':id' => $id]);
        $loan = $loanStmt->fetch(PDO::FETCH_ASSOC);
        if (!$loan) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['error' => 'Prêt introuvable']);
            return;
        }

        $alreadyReturned = $pdo->prepare('SELECT 1 FROM `Rendu` WHERE IDemprunt = :id LIMIT 1');
        $alreadyReturned->execute([':id' => $id]);
        if ($alreadyReturned->fetchColumn()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['error' => 'Déjà rendu']);
            return;
        }

        $start = $loan['DATEdebut'] ?? '';
        $due = $loan['DATEfin'] ?? $start;
        $requested = normalize_date_input((string) ($req['DATEfinDemande'] ?? ''));
        $borrowerRole = $loan['Role'] ?? '';
        $maxDays = max_reservation_days_for_role($borrowerRole);
        if ($requested === null) {
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode(['error' => 'Date demandée invalide']);
            return;
        }
        $status = strtolower((string) ($loan['ETATemprunt'] ?? ''));
        if (is_maintenance_kind($status)) {
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode(['error' => 'Maintenance : prolongation impossible']);
            return;
        }
        if ($status === 'annulation demandee') {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['error' => 'Annulation en cours : impossible de prolonger']);
            return;
        }

        if ($decision === 'approve') {
            if (strtotime($requested) <= strtotime($due)) {
                $pdo->rollBack();
                http_response_code(400);
                echo json_encode(['error' => 'La nouvelle date doit dépasser la date actuelle']);
                return;
            }
            $duration = days_between_inclusive($start, $requested);
            if ($duration > $maxDays) {
                $pdo->rollBack();
                http_response_code(400);
                echo json_encode(['error' => 'Durée maximale de ' . $maxDays . ' jours dépassée']);
                return;
            }
            $conflict = $pdo->prepare(
                'SELECT 1
                 FROM `Emprunt` e
                 WHERE e.IDmateriel = :mid
                   AND e.IDemprunt <> :id
                   AND NOT EXISTS (SELECT 1 FROM `Rendu` r WHERE r.IDemprunt = e.IDemprunt)
                   AND e.DATEdebut <= :newEnd
                   AND e.DATEfin >= :start
                 LIMIT 1'
            );
            $conflict->execute([
                ':mid' => (int) ($loan['IDmateriel'] ?? 0),
                ':id' => $id,
                ':newEnd' => $requested,
                ':start' => $start,
            ]);
            if ($conflict->fetchColumn()) {
                $pdo->rollBack();
                http_response_code(409);
                echo json_encode(['error' => 'Conflit avec une autre réservation']);
                return;
            }

            $updateLoan = $pdo->prepare(
                'UPDATE `Emprunt`
                 SET DATEfin = :due
                 WHERE IDemprunt = :id'
            );
            $updateLoan->execute([':due' => $requested, ':id' => $id]);

            $shouldBlockNow = period_is_current($start, $requested, date('Y-m-d'));
            if ($shouldBlockNow) {
                $block = $pdo->prepare('UPDATE `Materiel` SET Dispo = "Non" WHERE IDmateriel = :mid');
                $block->execute([':mid' => (int) ($loan['IDmateriel'] ?? 0)]);
            }
        }

        $newStatus = $decision === 'approve' ? 'approved' : 'rejected';
        $updateReq = $pdo->prepare(
            'UPDATE `Prolongation`
             SET Status = :st
             WHERE IDprolongation = :pid'
        );
        $updateReq->execute([':st' => $newStatus, ':pid' => (int) $req['IDprolongation']]);

        $userId = (int) ($loan['IDuser'] ?? 0);
        if ($userId > 0) {
            $materialName = trim((string) ($loan['NOMmateriel'] ?? 'le matériel'));
            if ($decision === 'approve') {
                $message = sprintf(
                    'Votre emprunt pour %s est prolongé jusqu\'au %s.',
                    $materialName !== '' ? $materialName : 'le matériel',
                    format_date_fr($requested)
                );
            } else {
                $message = sprintf(
                    'Votre demande de prolongation pour %s a été refusée (date demandée : %s).',
                    $materialName !== '' ? $materialName : 'le matériel',
                    format_date_fr($requested)
                );
            }
            enqueue_notification($pdo, $userId, $message);
        }

        $pdo->commit();
        echo json_encode(['status' => 'ok', 'decision' => $newStatus, 'new_due' => $decision === 'approve' ? $requested : null]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Traitement impossible', 'details' => $e->getMessage()]);
    }
}

// Enregistre une notification pour un utilisateur (annulation par admin ou maintenance).
function enqueue_notification(PDO $pdo, int $userId, string $message): void
{
    if ($userId <= 0 || trim($message) === '') {
        return;
    }
    try {
        $insert = $pdo->prepare(
            'INSERT INTO `Notification` (IDuser, Message)
             VALUES (:uid, :msg)'
        );
        $insert->execute([':uid' => $userId, ':msg' => $message]);
    } catch (Throwable $e) {
        error_log('Notification insert failed: ' . $e->getMessage());
    }
}

// Récupère les notifications non lues d'un utilisateur puis les marque comme vues.
function consume_notifications(PDO $pdo, int $userId): array
{
    if ($userId <= 0) {
        return [];
    }
    try {
        $stmt = $pdo->prepare(
            'SELECT IDnotification AS id, Message AS message, CreatedAt AS created_at
             FROM `Notification`
             WHERE IDuser = :uid AND Seen = 0
             ORDER BY CreatedAt DESC'
        );
        $stmt->execute([':uid' => $userId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($rows)) {
            $mark = $pdo->prepare('UPDATE `Notification` SET Seen = 1 WHERE IDuser = :uid AND Seen = 0');
            $mark->execute([':uid' => $userId]);
        }
        return array_map(
            static fn($row) => [
                'id' => (int) ($row['id'] ?? 0),
                'message' => $row['message'] ?? '',
                'created_at' => $row['created_at'] ?? '',
            ],
            $rows
        );
    } catch (Throwable $e) {
        return [];
    }
}

// Normalise une chaîne de date AAAA-MM-JJ (retourne null si invalide).
function normalize_date_input(string $value): ?string
{
    $value = trim($value);
    if ($value === '') {
        return null;
    }
    $dt = DateTime::createFromFormat('Y-m-d', $value);
    if (!$dt || $dt->format('Y-m-d') !== $value) {
        return null;
    }
    return $dt->format('Y-m-d');
}

// Calcule le nombre de jours inclus entre deux dates.
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

// Détecte si un statut correspond à une maintenance.
function is_maintenance_kind(string $value): bool
{
    return str_contains(strtolower($value), 'maintenance');
}

// Retourne la durée max autorisée pour un emprunt selon le rôle.
function max_reservation_days_for_role(string $role): int
{
    $role = strtolower(trim($role));
    if (str_contains($role, 'prof')) {
        return 21;
    }
    return 14;
}

// Récupère le rôle d'un utilisateur.
function fetch_user_role(PDO $pdo, int $userId): string
{
    if ($userId <= 0) {
        return '';
    }
    try {
        $stmt = $pdo->prepare(
            'SELECT r.Role
             FROM `User` u
             LEFT JOIN `Role` r ON r.IDrole = u.IDrole
             WHERE u.IDuser = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $role = $stmt->fetchColumn();
        return is_string($role) ? $role : '';
    } catch (Throwable $e) {
        return '';
    }
}

// Indique si une période englobe la date fournie.
function period_is_current(string $start, string $end, string $today): bool
{
    $startTs = strtotime($start);
    $endTs = strtotime($end);
    $todayTs = strtotime($today);
    if ($startTs === false || $endTs === false || $todayTs === false) {
        return false;
    }
    if ($endTs < $startTs) {
        [$startTs, $endTs] = [$endTs, $startTs];
    }
    return $startTs <= $todayTs && $todayTs <= $endTs;
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

// Formate une date AAAA-MM-JJ en JJ/MM/AAAA (fallback brut si invalide).
function format_date_fr(?string $date): string
{
    $ts = $date ? strtotime($date) : false;
    if ($ts === false) {
        return (string) ($date ?? '');
    }
    return date('d/m/Y', $ts);
}

// Normalise un libellé d'état de matériel.
function normalize_condition(string $value): string
{
    $value = strtolower(trim($value));
    $map = [
        'neuf' => 'neuf',
        'bon' => 'bon',
        'passable' => 'passable',
        'reparation necessaire' => 'reparation nécessaire',
        'reparation nécessaire' => 'reparation nécessaire',
        'reparation' => 'reparation nécessaire',
    ];
    return $map[$value] ?? $value;
}

// Retourne un score numérique pour comparer deux états.
function condition_rank(string $value): int
{
    $value = normalize_condition($value);
    $order = ['reparation nécessaire' => 0, 'passable' => 1, 'bon' => 2, 'neuf' => 3];
    return $order[$value] ?? 1;
}

// Détecte si un état de retour traduit une dégradation.
function is_degradation(string $etatRendu): bool
{
    if (str_starts_with((string) $etatRendu, 'degrade:')) {
        return true;
    }
    if (!str_contains((string) $etatRendu, '->')) {
        return false;
    }
    [$before, $after] = array_pad(explode('->', (string) $etatRendu, 2), 2, '');
    return condition_rank($after) < condition_rank($before);
}
