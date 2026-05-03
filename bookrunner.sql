CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(120) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
    id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id    UUID          NOT NULL,
    title      VARCHAR(255)  NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    quantity   INTEGER       NOT NULL DEFAULT 1,
    added_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, book_id)
);

CREATE TABLE IF NOT EXISTS orders (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       VARCHAR(50)   NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    total_amount NUMERIC(10,2) NOT NULL,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    book_id    UUID          NOT NULL,
    title      VARCHAR(255)  NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    quantity   INTEGER       NOT NULL DEFAULT 1,
    line_total NUMERIC(10,2) NOT NULL CHECK (line_total = unit_price * quantity)
);
