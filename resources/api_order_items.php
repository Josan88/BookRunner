<?php

header('Content-Type: application/json');
$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);

$conn = mysqli_connect('localhost', 'root', '', 'bookrunner');
mysqli_set_charset($conn, 'utf8');

if ($method === 'DELETE') {
    // Expecting ?id=ORDER_ITEM_ID&order_id=ORDER_ID
    $item_id = isset($_GET['id']) ? intval($_GET['id']) : 0;
    $order_id = isset($_GET['order_id']) ? intval($_GET['order_id']) : 0;
    if (!$item_id || !$order_id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id or order_id']);
        exit;
    }

    // Delete the order item
    $del = mysqli_query($conn, "DELETE FROM order_items WHERE id='$item_id'");

    // Check if the order has any items left
    $res = mysqli_query($conn, "SELECT COUNT(*) AS cnt FROM order_items WHERE order_id='$order_id'");
    $row = mysqli_fetch_assoc($res);
    if ($row['cnt'] == 0) {
        // Delete the order itself
        mysqli_query($conn, "DELETE FROM orders WHERE id='$order_id'");
        echo json_encode(['success' => true, 'order_deleted' => true]);
    } else {
        echo json_encode(['success' => true, 'order_deleted' => false]);
    }
    mysqli_close($conn);
    exit;
}

if ($method === 'PUT') {
    // Expecting PUT /order_items.php?id=ORDER_ITEM_ID
    $item_id = isset($_GET['id']) ? intval($_GET['id']) : 0;
    if (!$item_id || !$input || !is_array($input)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid ID or data']);
        exit;
    }

    // Sanitize and build SET clause
    $columns = array_map(function($col) {
        return preg_replace('/[^a-z0-9_]+/i', '', $col);
    }, array_keys($input));

    $values = array_map(function ($value) use ($conn) {
        return $value === null ? 'NULL' : '"' . mysqli_real_escape_string($conn, $value) . '"';
    }, array_values($input));

    $set = [];
    for ($i = 0; $i < count($columns); $i++) {
        $set[] = "`{$columns[$i]}`={$values[$i]}";
    }

    $setClause = implode(',', $set);
    $sql = "UPDATE order_items SET $setClause WHERE id='$item_id'";

    if (mysqli_query($conn, $sql)) {
        echo json_encode(['success' => true, 'affected_rows' => mysqli_affected_rows($conn)]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => mysqli_error($conn)]);
    }

    mysqli_close($conn);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
mysqli_close($conn);
exit;
