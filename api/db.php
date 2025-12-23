<?php

// Point unique de connexion pour reutiliser le meme PDO et eviter les doublons.
function get_pdo(): PDO
{
    // Cache le handle pour ne pas ouvrir plusieurs connexions par requete.
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    // Charge la config centralisee (env possible) pour garder un seul endroit a modifier.
    $config = require __DIR__ . '/config.php';

    // Options pour securiser et standardiser les erreurs/retours.
    $options = [
        // Remonter les erreurs SQL en exceptions pour gerer proprement l'API.
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        // Evite de manipuler des tableaux mixtes (numeriques + assoc).
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        // Interdire l'emulation pour garder les requetes preparees reelles.
        PDO::ATTR_EMULATE_PREPARES => false,
        // Bloque les multi-statements pour reduire le risque d'injection.
        defined('PDO::MYSQL_ATTR_MULTI_STATEMENTS') ? PDO::MYSQL_ATTR_MULTI_STATEMENTS : 2014 => false,
    ];

    // Instancie la connexion avec les options definies ci-dessus.
    $pdo = new PDO($config['dsn'], $config['user'], $config['password'], $options);

    return $pdo;
}
