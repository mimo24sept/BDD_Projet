<?php
// Basic database configuration (MySQL / phpMyAdmin). Override with environment variables.

return [
    // Example DSN for MySQL: mysql:host=localhost;port=3306;dbname=parc_materiels;charset=utf8mb4
    'dsn' => getenv('DB_DSN') ?: 'mysql:host=localhost;port=3306;dbname=parc_materiels;charset=utf8mb4',
    'user' => getenv('DB_USER') ?: 'root',
    'password' => getenv('DB_PASSWORD') ?: '',
];
