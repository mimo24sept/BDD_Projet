<?php

function get_pdo(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = require __DIR__ . '/config.php';

    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        defined('PDO::MYSQL_ATTR_MULTI_STATEMENTS') ? PDO::MYSQL_ATTR_MULTI_STATEMENTS : 2014 => false,
    ];

    $pdo = new PDO($config['dsn'], $config['user'], $config['password'], $options);

    return $pdo;
}
