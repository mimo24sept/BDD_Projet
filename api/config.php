<?php
// Basic database configuration (MySQL / phpMyAdmin). Override with environment variables.
$envTokens = getenv('API_TOKENS') ?: 'demo-token';
// Allow multiple tokens separated by comma in API_TOKENS env variable.
$tokens = array_values(array_filter(array_map('trim', explode(',', $envTokens))));

return [
    // Example DSN for MySQL: mysql:host=localhost;port=3306;dbname=parc_materiels;charset=utf8mb4
    'dsn' => getenv('DB_DSN') ?: 'mysql:host=localhost;port=3306;dbname=parc_materiels;charset=utf8mb4',
    'user' => getenv('DB_USER') ?: 'root',
    'password' => getenv('DB_PASSWORD') ?: '',
    'tokens' => $tokens,
];
