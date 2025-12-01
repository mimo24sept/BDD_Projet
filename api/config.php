<?php
// Basic database configuration (MySQL / phpMyAdmin). Override with environment variables.

return [
    // Example DSN for MySQL: mysql:host=127.0.0.1;port=3306;dbname=Projet_BDD;charset=utf8mb4
    // On Arch, passer par 127.0.0.1 force l’utilisation du TCP et évite les permissions du socket local.
    'dsn' => getenv('DB_DSN') ?: 'mysql:host=127.0.0.1;port=3306;dbname=Projet_BDD;charset=utf8mb4',
    'user' => getenv('DB_USER') ?: 'root',
    'password' => getenv('DB_PASSWORD') ?: 'olivier',
];
