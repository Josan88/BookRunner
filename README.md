# Setting Up the BookRunner Database and Website Using XAMPP

## Requirements

- XAMPP Control Panel installed on your machine  
- Apache and MySQL modules running in the XAMPP Control Panel  
- A web browser, preferably Google Chrome  

---

## Step 1: Unzip the BookRunner Folder

- Unzip the downloaded **BookRunner** folder to a location of your choice.

---

## Step 2: Start Apache and MySQL in XAMPP

1. Open the **XAMPP Control Panel**
2. Click **Start** next to both **Apache** and **MySQL**

---

## Step 3: Open phpMyAdmin

1. Open your web browser  
2. Navigate to: [`http://localhost/phpmyadmin`](http://localhost/phpmyadmin)

---

## Step 4: Import the SQL Code

1. Click on the **bookrunner** database (create one if it doesn’t exist)  
2. Go to the **Import** tab  
3. Click **Choose File** and select the `bookrunner.sql` file  
4. Click **Import**

✅ You now have a `bookrunner` database with four tables:  
- `users`  
- `cart`  
- `orders`  
- `order_items`

---

## Hosting the BookRunner Website Using XAMPP

### Step 1: Navigate to the `htdocs` Folder

- **Windows:** `C:\xampp\htdocs`  
- **macOS:** `/Applications/XAMPP/htdocs`

### Step 2: Place the Unzipped Folder

- Move the unzipped **BookRunner** folder into the `htdocs` directory

### Step 3: Access the Website

1. Ensure **Apache** and **MySQL** are running in the XAMPP Control Panel  
2. Open your browser and navigate to:  
   [`http://localhost/BookRunner/Project`](http://localhost/BookRunner/Project)

---

## Running the Node.js + Express Backend

### Requirements

- [Node.js](https://nodejs.org/) v18 or later
- npm (bundled with Node.js)

### Step 1: Install dependencies

```bash
cd backend
npm install
```

### Step 2: Configure environment variables

```bash
cp .env.example .env
# Edit .env as needed (PORT, HOST, NODE_ENV)
```

### Step 3: Start the server

```bash
npm start
```

The API will be available at `http://localhost:3000` by default.

### Health check

```
GET /health
```

Returns HTTP 200 with JSON:

```json
{ "status": "ok" }
```

### Run smoke test

```bash
npm test
```

### Verification notes

Verified locally with:

- `npm install`
- `npm start` (server booted successfully)
- `GET /health` returned `200 {"status":"ok"}`
- `npm test` passed for `GET /health`

---
