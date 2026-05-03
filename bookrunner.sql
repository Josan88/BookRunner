CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id        SERIAL PRIMARY KEY,
    username  VARCHAR(50)  NOT NULL,
    email     VARCHAR(100) NOT NULL,
    password  VARCHAR(255) NOT NULL,
    age       INTEGER      NOT NULL,
    gender    VARCHAR(10)  NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
    reg_date  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    book_title VARCHAR(255) NOT NULL,
    cover      VARCHAR(255) NOT NULL,
    volume     VARCHAR(50)  NOT NULL,
    quantity   INTEGER      NOT NULL DEFAULT 1,
    price      NUMERIC(10,2) NOT NULL,
    added_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    purchase_date TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id         SERIAL PRIMARY KEY,
    order_id   INTEGER      NOT NULL REFERENCES orders(id) ON DELETE CASCADE ON UPDATE CASCADE,
    book_title VARCHAR(255) NOT NULL,
    volume     VARCHAR(50)  NOT NULL,
    quantity   INTEGER      NOT NULL DEFAULT 1,
    price      NUMERIC(10,2) NOT NULL,
    cover      VARCHAR(255) NOT NULL
);
