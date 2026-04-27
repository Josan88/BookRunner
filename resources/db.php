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
        echo json_encode([
            'error' => 'Database connection failed',
            'details' => mysqli_connect_error()
        ]);
        exit;
    }

    mysqli_set_charset($conn, 'utf8');
    return $conn;
}
