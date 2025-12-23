<?php
// Config BD centralisee pour eviter de dupliquer les parametres.

return [
    // On privilegie les variables d'env pour deployer sans toucher au code.
    // 127.0.0.1 force le TCP pour eviter les soucis de socket local.
    'dsn' => getenv('DB_DSN') ?: 'mysql:host=127.0.0.1;port=3306;dbname=Projet_BDD;charset=utf8mb4',
    // Identifiants par defaut pour un setup local simple.
    'user' => getenv('DB_USER') ?: 'root',
    'password' => getenv('DB_PASSWORD') ?: 'olivier',
];
