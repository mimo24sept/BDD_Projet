<?php
declare(strict_types=1);

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

if ($method === 'POST' && $action === 'return') {
    if (!is_admin()) {
        http_response_code(403);
        echo json_encode(['error' => 'Retour réservé aux administrateurs']);
        exit;
    }
    return_pret($pdo, (int) $_SESSION['user_id']);
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
                   m.NOMmateriel, m.Emplacement, m.IDmateriel,
                   r.DATErendu,
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
        $status = $returnedAt ? 'rendu' : (strtolower((string) $row['ETATemprunt']) ?: 'en cours');
        $loans[] = [
            'id' => (int) $row['IDemprunt'],
            'type' => 'pret',
            'name' => $row['NOMmateriel'],
            'start' => $start ?: compute_start_date($due),
            'due' => $due,
            'status' => $status,
            'progress' => progress_percent($start ?: compute_start_date($due), $due),
            'user' => $row['NOMuser'] ?? '',
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
    $total = count($loans);
    $returned = count(array_filter($loans, static fn($l) => $l['status'] === 'rendu'));
    $active = $total - $returned;

    return [
        'total_year' => $total,
        'active' => $active,
        'returned' => $returned,
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
    $allowed = ['neuf', 'bon', 'passable', 'reparation nécessaire'];
    if ($condition !== '' && !in_array($condition, $allowed, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Etat invalide']);
        return;
    }

    $pdo->beginTransaction();
    try {
        $select = $pdo->prepare(
            'SELECT IDmateriel FROM `Emprunt`
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

        $updateMat = $pdo->prepare('UPDATE `Materiel` SET Dispo = "Oui", Etat = :etat WHERE IDmateriel = :mid');
        $updateMat->execute([':mid' => $materielId, ':etat' => $condition !== '' ? $condition : 'Bon']);

        $insertRendu = $pdo->prepare(
            'INSERT INTO `Rendu` (IDemprunt, DATErendu, ETATrendu)
             VALUES (:id, CURDATE(), :etat)'
        );
        $insertRendu->execute([':id' => $id, ':etat' => $condition !== '' ? $condition : 'Rendu']);

        $pdo->commit();
        echo json_encode(['status' => 'ok', 'returned_id' => $id]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Retour impossible', 'details' => $e->getMessage()]);
    }
}

function is_admin(): bool
{
    $role = (string) ($_SESSION['role'] ?? '');
    return stripos($role, 'admin') !== false;
}
