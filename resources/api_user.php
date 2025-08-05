<?php

// get the HTTP method, path and body of the request
$method = $_SERVER['REQUEST_METHOD'];
$path_info = isset($_SERVER['PATH_INFO']) ? $_SERVER['PATH_INFO'] : '';
$request = explode('/', trim($path_info,'/'));
$input = json_decode(file_get_contents('php://input'),true);  // json string to associative array(true)

// connect to the mysql database, provide the appropriate credentials
$conn = mysqli_connect('localhost', 'root', '', 'bookrunner');
mysqli_set_charset($conn,'utf8');

// initialise the table name accordingly
$table = "users";

// retrieve the search key field name and value from the path
$fld = preg_replace('/[^a-z0-9_]+/i','',array_shift($request));
$key = array_shift($request);

// fallback for query string (for GET/PUT if PATH_INFO not set)
if (!$fld && isset($_GET['id'])) {
    $fld = 'id';
    $key = $_GET['id'];
}

// retrieve the data to prepare set values
if (isset($input))  {
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

// Return all emails if requested
if (isset($_GET['getAllEmails']) && $_GET['getAllEmails'] === 'true') {
    $result = mysqli_query($conn, "SELECT email FROM `$table`");
    $emails = [];
    while ($row = mysqli_fetch_assoc($result)) {
        $emails[] = $row['email'];
    }
    echo json_encode($emails);
    mysqli_close($conn);
    exit;
}

// Return user by email if requested
if (isset($_GET['email'])) {
    $email = mysqli_real_escape_string($conn, $_GET['email']);
    $result = mysqli_query($conn, "SELECT * FROM `$table` WHERE email='$email' LIMIT 1");
    $user = mysqli_fetch_assoc($result);
    echo json_encode($user ? $user : null);
    mysqli_close($conn);
    exit;
}

// create SQL
$sql = null;
switch ($method) {
    case 'GET':
        // GET /users/id/5 => get user profile by id
        if ($fld === 'id' && $key) {
            $sql = "SELECT id, username, email, age, gender, reg_date FROM `$table` WHERE id='".mysqli_real_escape_string($conn, $key)."'";
        }
        break;
    case 'PUT':
        // PUT /users/id/5 => update user profile by id
        if ($fld === 'id' && $key && !empty($set)) {
            $sql = "UPDATE `$table` SET $set WHERE id='".mysqli_real_escape_string($conn, $key)."'";
        }
        break;
    case 'POST':
        // Registration: if username, email, password, age, gender are set
        if (
            isset($input['username']) && isset($input['email']) && isset($input['password']) &&
            isset($input['age']) && isset($input['gender'])
        ) {
            $username = mysqli_real_escape_string($conn, $input['username']);
            $email = mysqli_real_escape_string($conn, $input['email']);
            $password = mysqli_real_escape_string($conn, $input['password']);
            $age = (int)$input['age'];
            $gender = mysqli_real_escape_string($conn, $input['gender']);

            // Check if email already exists
            $checkEmailSql = "SELECT id FROM `$table` WHERE email='$email' LIMIT 1";
            $checkResult = mysqli_query($conn, $checkEmailSql);
            if ($checkResult && mysqli_num_rows($checkResult) > 0) {
                http_response_code(409); // Conflict
                echo json_encode(['error' => 'Email already registered']);
                mysqli_close($conn);
                exit;
            }

            $sql = "INSERT INTO `$table` (username, email, password, age, gender) VALUES ('$username', '$email', '$password', $age, '$gender')";
        }
        // Login: if only email and password are set
        else if (isset($input['email']) && isset($input['password'])) {
            $sql = "SELECT * FROM `$table` WHERE email='" . mysqli_real_escape_string($conn, $input['email']) . "' AND password='" . mysqli_real_escape_string($conn, $input['password']) . "'";
        }
        break;
    default:
        http_response_code(405); // Method Not Allowed
        echo json_encode(['error' => 'Method not allowed']);
        mysqli_close($conn);
        exit;
}

// execute SQL statement if set
if ($sql) {
    $result = mysqli_query($conn, $sql);
    if ($result) {
        if ($method == 'POST') {
            // If registration (INSERT), return success
            if (isset($input['username'])) {
                echo json_encode(['success' => true]);
            } else {
                // If login (SELECT), return user object or null
                echo json_encode(mysqli_fetch_object($result));
            }
        } else if ($method == 'GET') {
            // Return user profile as object
            echo json_encode(mysqli_fetch_object($result));
        } else if ($method == 'PUT') {
            echo json_encode(['success' => true, 'affected_rows' => mysqli_affected_rows($conn)]);
        } else {
            echo mysqli_affected_rows($conn);
        }
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Database query failed', 'details' => mysqli_error($conn)]);
    }
} else {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid input or missing parameters']);
}

// close mysql connection
mysqli_close($conn);
?>
