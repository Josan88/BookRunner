<?php
require_once __DIR__ . '/db.php';
header('Content-Type: application/json');
$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);

$conn = bookrunner_db_connect();

if ($method === 'POST') {
    if (!isset($input['user_id']) || !isset($input['items']) || !is_array($input['items'])) {
        http_response_code(400);
        echo json_encode(["error" => "Missing user_id or items"]);
        exit;
    }
    $user_id = intval($input['user_id']);
    $items = $input['items'];

    mysqli_begin_transaction($conn);

    // Insert order
    $order_sql = "INSERT INTO orders (user_id) VALUES ('$user_id')";
    if (!mysqli_query($conn, $order_sql)) {
        mysqli_rollback($conn);
        http_response_code(500);
        echo json_encode(["error" => "Failed to create order"]);
        exit;
    }
    $order_id = mysqli_insert_id($conn);

    // Insert items into order_items
    $success = true;
    foreach ($items as $item) {
        $book_title = mysqli_real_escape_string($conn, $item['book_title']);
        $volume = mysqli_real_escape_string($conn, $item['volume']);
        $quantity = intval($item['quantity']);
        $price = floatval($item['price']);
        $cover = mysqli_real_escape_string($conn, $item['cover']);
        $item_sql = "INSERT INTO order_items (order_id, book_title, volume, quantity, price, cover)
                     VALUES ('$order_id', '$book_title', '$volume', $quantity, $price, '$cover')";
        if (!mysqli_query($conn, $item_sql)) {
            $success = false;
            break;
        }
    }

    if ($success) {
        mysqli_commit($conn);
        echo json_encode(["id" => $order_id]);
    } else {
        mysqli_rollback($conn);
        http_response_code(500);
        echo json_encode(["error" => "Failed to insert items"]);
    }
    mysqli_close($conn);
    exit;
}

if ($method === 'GET') {
    // Optional: filter by user_id
    $user_id = isset($_GET['user_id']) ? intval($_GET['user_id']) : null;
    $orders = [];
    $order_sql = "SELECT * FROM orders" . ($user_id ? " WHERE user_id='$user_id'" : "") . " ORDER BY purchase_date DESC";
    $res = mysqli_query($conn, $order_sql);
    while ($order = mysqli_fetch_assoc($res)) {
        $order_id = $order['id'];
        $items = [];
        $res2 = mysqli_query($conn, "SELECT * FROM order_items WHERE order_id='$order_id'");
        while ($item = mysqli_fetch_assoc($res2)) $items[] = $item;
        $order['items'] = $items;
        $orders[] = $order;
    }
    echo json_encode($orders);
    mysqli_close($conn);
    exit;
}
// Add GET/DELETE logic as needed...

http_response_code(405);
echo json_encode(["error" => "Method not allowed"]);
mysqli_close($conn);
exit;
