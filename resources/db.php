<?php

function bookrunner_db_connect() {
    $host = getenv('DB_HOST') ?: 'localhost';
    $port = (int)(getenv('DB_PORT') ?: 3306);
    $name = getenv('DB_NAME') ?: 'bookrunner';
    $user = getenv('DB_USER') ?: 'root';
    $pass = getenv('DB_PASSWORD') ?: '';

    $conn = mysqli_init();
    $connected = mysqli_real_connect($conn, $host, $user, $pass, $name, $port);

    if (!$connected) {
        header('Content-Type: application/json');
        http_response_code(500);
        error_log('Database connection failed: ' . mysqli_connect_error());
        echo json_encode(['error' => 'Database connection failed']);
        exit;
    }

    if (!mysqli_set_charset($conn, 'utf8mb4')) {
        error_log('Failed to set MySQL charset to utf8mb4: ' . mysqli_error($conn));
    }
    return $conn;
}
