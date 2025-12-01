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

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Connectez-vous pour voir vos emprunts']);
    exit;
}

require_once __DIR__ . '/db.php';

try {
    $pdo = get_pdo();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Connexion à la base impossible', 'details' => $e->getMessage()]);
    exit;
}

try {
    $loans = fetch_loans($pdo, (int) $_SESSION['user_id']);
    $stats = build_stats($loans);
    echo json_encode(['loans' => $loans, 'stats' => $stats]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Lecture des données impossible', 'details' => $e->getMessage()]);
}

function fetch_loans(PDO $pdo, int $userId): array
{
    $loans = [];

    // Prêts en cours ou rendus
    $pret = $pdo->prepare(
        'SELECT p.IDpret, p.IDuser, p.Retour, p.Retour_effectif, p.Etat_retour, p.Remarque,
                m.NOMmateriel, m.Emplacement
         FROM `Pret` p
         JOIN `Matériels` m ON m.IDmateriel = p.IDmateriel
         WHERE p.IDuser = :uid'
    );
    $pret->execute([':uid' => $userId]);
    foreach ($pret->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $due = $row['Retour'] ?? null;
        $start = compute_start_date($due);
        $returned = $row['Retour_effectif'] ?? null;
        $status = $returned && $returned !== '0000-00-00' ? 'rendu' : 'en cours';
        $loans[] = [
            'id' => (int) $row['IDpret'],
            'name' => $row['NOMmateriel'],
            'start' => $start,
            'due' => $due,
            'status' => $status,
            'progress' => progress_percent($start, $due),
        ];
    }

    // Réservations à venir
    $reservations = $pdo->prepare(
        'SELECT r.IDreservation, r.Debut, r.Statut, m.NOMmateriel
         FROM `réservation` r
         JOIN `Matériels` m ON m.IDmateriel = r.IDmateriel
         WHERE r.IDuser = :uid'
    );
    $reservations->execute([':uid' => $userId]);
    foreach ($reservations->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $loans[] = [
            'id' => (int) $row['IDreservation'],
            'name' => $row['NOMmateriel'],
            'start' => $row['Debut'],
            'due' => $row['Debut'],
            'status' => strtolower((string) $row['Statut'] ?: 'reserve'),
            'progress' => 5,
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
