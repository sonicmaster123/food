CREATE DATABASE IF NOT EXISTS food_expiry CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE food_expiry;

CREATE TABLE IF NOT EXISTS food_items (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category ENUM('dairy','meat','vegetable','fruit','grain','beverage','snack','condiment','frozen','other') NOT NULL,
    expiry DATE NOT NULL,
    added_at DATETIME NOT NULL,
    consumed TINYINT(1) NOT NULL DEFAULT 0,
    consumed_at DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
