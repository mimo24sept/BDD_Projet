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

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Connectez-vous pour voir vos emprunts']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'GET' && $action === 'admin_stats') {
    if (!is_admin()) {
        http_response_code(403);
        echo json_encode(['error' => 'Réservé aux administrateurs']);
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
    if (!is_admin()) {
        http_response_code(403);
        echo json_encode(['error' => 'Retour réservé aux administrateurs']);
        exit;
    }
    return_pret($pdo, (int) $_SESSION['user_id']);
    exit;
}

if ($method === 'POST' && $action === 'cancel_request') {
    request_cancel($pdo, (int) $_SESSION['user_id']);
    exit;
}

try {
    $scope = $_GET['scope'] ?? 'mine';
    $targetUser = ($scope === 'all' && is_admin()) ? null : (int) $_SESSION['user_id'];
    $loans = fetch_loans($pdo, $targetUser);
    $stats = build_stats($loans);
    echo json_encode(['loans' => $loans, 'stats' => $stats]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Lecture des données impossible', 'details' => $e->getMessage()]);
}

function fetch_loans(PDO $pdo, ?int $userId): array
{
    $loans = [];

    $where = $userId !== null ? 'WHERE e.IDuser = :uid' : '';
    $sql = "SELECT e.IDemprunt, e.DATEdebut, e.DATEfin, e.ETATemprunt,
                   m.NOMmateriel, m.Emplacement, m.IDmateriel, m.Etat AS EtatMateriel,
                   r.DATErendu, r.ETATrendu,
                   u.NOMuser
            FROM `Emprunt` e
            JOIN `Materiel` m ON m.IDmateriel = e.IDmateriel
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
        $type = $kind === 'maintenance' ? 'maintenance' : 'pret';
        $status = $returnedAt ? 'rendu' : ($kind ?: 'en cours');
        $loans[] = [
            'id' => (int) $row['IDemprunt'],
            'type' => $type,
            'name' => $row['NOMmateriel'],
            'material_id' => (int) $row['IDmateriel'],
            'start' => $start ?: compute_start_date($due),
            'due' => $due,
            'status' => $status,
            'progress' => progress_percent($start ?: compute_start_date($due), $due),
            'user' => $row['NOMuser'] ?? '',
            'condition' => $row['EtatMateriel'] ?? '',
            'returned' => $returnedAt,
            'return_state' => $returnState,
        ];
    }

    usort($loans, static fn($a, $b) => strcmp($a['due'] ?? '', $b['due'] ?? ''));
    return $loans;
}

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
        $isMaintenance = $kind === 'maintenance';
        if ($isMaintenance) {
            $maints += 1;
        } else {
            $total += 1;
        }
        $start = $row['DATEdebut'] ?? null;
        $due = $row['DATEfin'] ?? null;
        $returned = $row['DATErendu'] ?? null;
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
               AND (:uid = IDuser OR :isAdmin = 1)
             LIMIT 1'
        );
        $select->execute([':id' => $id, ':uid' => $userId, ':isAdmin' => is_admin() ? 1 : 0]);
        $row = $select->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['error' => 'Prêt introuvable']);
            return;
        }
        $materielId = (int) $row['IDmateriel'];
        $isMaintenanceLoan = strtolower((string) ($row['ETATemprunt'] ?? '')) === 'maintenance';

        $alreadyReturned = $pdo->prepare('SELECT 1 FROM `Rendu` WHERE IDemprunt = :id LIMIT 1');
        $alreadyReturned->execute([':id' => $id]);
        if ($alreadyReturned->fetchColumn()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['error' => 'Déjà rendu']);
            return;
        }

        $updatePret = $pdo->prepare(
            'UPDATE `Emprunt`
             SET ETATemprunt = "Terminé"
             WHERE IDemprunt = :id'
        );
        $updatePret->execute([':id' => $id]);

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

function is_admin(): bool
{
    $role = (string) ($_SESSION['role'] ?? '');
    return stripos($role, 'admin') !== false;
}

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

function condition_rank(string $value): int
{
    $value = normalize_condition($value);
    $order = ['reparation nécessaire' => 0, 'passable' => 1, 'bon' => 2, 'neuf' => 3];
    return $order[$value] ?? 1;
}

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
