<?php
require_once __DIR__ . '/db.php';
header('Content-Type: application/json');

// get the HTTP method, path and body of the request
$method = $_SERVER['REQUEST_METHOD'];
$request = isset($_SERVER['PATH_INFO']) ? explode('/', trim($_SERVER['PATH_INFO'],'/')) : [];
$input = json_decode(file_get_contents('php://input'),true);

// connect to the mysql database
$conn = bookrunner_db_connect();

$table = "cart";

// retrieve the search key field name and value from the path
$fld = isset($request[0]) ? preg_replace('/[^a-z0-9_]+/i','',$request[0]) : null;
$key = isset($request[1]) ? $request[1] : null;

if (!$fld && isset($_GET['id'])) {
    $fld = 'id';
    $key = $_GET['id'];
}

// prepare set values for insert/update
if ($input)  {
    $columns = preg_replace('/[^a-z0-9_]+/i','',array_keys($input));
    $values = array_map(function ($value) use ($conn) {
        if ($value===null) return null;
        return mysqli_real_escape_string($conn,(string)$value);
    },array_values($input));

    $set = '';
    for ($i=0;$i<count($columns);$i++) {
        $set.=($i>0?',':'').'`'.$columns[$i].'`=';
        $set.=($values[$i]===null?'NULL':'"'.$values[$i].'"');
    }
}

// create SQL
switch ($method) {
    case 'GET':
        // GET /cart/user_id/123  => get all cart items for user_id=123
        if ($fld === 'user_id' && $key) {
            $sql = "SELECT * FROM `$table` WHERE user_id='".mysqli_real_escape_string($conn, $key)."'";
        } 
        // GET /cart/id/5 => get cart item with id=5
        elseif ($fld === 'id' && $key) {
            $sql = "SELECT * FROM `$table` WHERE id='".mysqli_real_escape_string($conn, $key)."'";
        } 
        // GET /cart => get all cart items
        else {
            $sql = "SELECT * FROM `$table`";
        }
        break;
    case 'PUT':
        // PUT /cart/id/5 => update cart item with id=5
        if ($fld === 'id' && $key) {
            $sql = "UPDATE `$table` SET $set WHERE id='".mysqli_real_escape_string($conn, $key)."'";
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Missing or invalid cart item id for update']);
            exit;
        }
        break;
    case 'POST':
        // POST /cart => add new cart item
        $sql = "INSERT INTO `$table` SET $set";
        break;
    case 'DELETE':
        // Try to get id from path, query string, or JSON body
        $cartId = null;
        if ($fld === 'id' && $key) {
            $cartId = $key;
        } elseif (isset($_GET['id']) && $_GET['id']) {
            $cartId = $_GET['id'];
        } elseif (isset($input['id']) && $input['id']) {
            $cartId = $input['id'];
        }

        if ($cartId) {
            $sql = "DELETE FROM `$table` WHERE id='" . mysqli_real_escape_string($conn, $cartId) . "'";
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Missing or invalid cart item id for delete']);
            exit;
        }
        break;
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method Not Allowed']);
        exit;
}

// execute SQL statement
$result = mysqli_query($conn,$sql);

if ($result) {
    if ($method == 'GET') {
        $rows = [];
        while ($row = mysqli_fetch_assoc($result)) {
            $rows[] = $row;
        }
        echo json_encode($rows);
    } elseif ($method == 'POST') {
        http_response_code(201);
        echo json_encode(['id' => mysqli_insert_id($conn)]);
    } else {
        echo json_encode(['affected_rows' => mysqli_affected_rows($conn)]);
    }
} else {
    http_response_code(500);
    echo json_encode(['error' => mysqli_error($conn)]);
}

mysqli_close($conn);
?>
