<?php
declare(strict_types=1);
// Endpoint de reset pour repartir d'un etat de demo propre et reproductible.

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Preflight CORS sans logique metier.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Session requise pour verifier le role admin.
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
    echo json_encode(['error' => 'Connectez-vous en admin']);
    exit;
}

$role = $_SESSION['role'] ?? '';
if (stripos((string) $role, 'admin') === false) {
    http_response_code(403);
    echo json_encode(['error' => 'Réservé aux administrateurs']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    // Transaction pour garder un etat coherent si une requete echoue.
    $pdo->beginTransaction();
    // On remet tout disponible pour repartir d'un stock utilisable.
    $pdo->exec('UPDATE `Materiel` SET Dispo = "Oui"');

    // Supprimer emprunts et rendus pour repartir d'un historique vierge.
    $pdo->exec('DELETE FROM `Rendu`');
    $pdo->exec('DELETE FROM `Emprunt`');

    $pdo->commit();
    echo json_encode(['status' => 'ok', 'message' => 'Etat remis à neuf (tout disponible, aucune reservation/pret)']);
} catch (Throwable $e) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Reset impossible', 'details' => $e->getMessage()]);
}
