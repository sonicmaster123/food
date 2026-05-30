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

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
    approved TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS passwords (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    site_name VARCHAR(100) NOT NULL,
    domain VARCHAR(255) DEFAULT NULL,
    username VARCHAR(200) NOT NULL,
    password_encrypted TEXT NOT NULL,
    notes TEXT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
