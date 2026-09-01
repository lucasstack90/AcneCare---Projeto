<?php
// AcneCare - configuração local PHP + MySQL
// Ajuste estes dados se o seu XAMPP/WAMP usar outras credenciais.

declare(strict_types=1);

const DB_HOST = '127.0.0.1';
const DB_NAME = 'acnecare';
const DB_USER = 'root';
const DB_PASS = '';

const MAX_FILE_SIZE = 15 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp'
];

const ALLOWED_VIDEO_TYPES = [
    'video/mp4', 'video/webm', 'video/ogg'
];

function db(): PDO {
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';

    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function jsonResponse(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function requireMethod(string $method): void {
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        jsonResponse(['ok' => false, 'message' => 'Método não permitido.'], 405);
    }
}

function requireLogin(): array {
    if (empty($_SESSION['user'])) {
        jsonResponse(['ok' => false, 'message' => 'Você precisa estar logado.'], 401);
    }

    return $_SESSION['user'];
}

function requireAdmin(): array {
    $user = requireLogin();

    if (($user['role'] ?? 'user') !== 'admin') {
        jsonResponse(['ok' => false, 'message' => 'Acesso restrito ao administrador.'], 403);
    }

    return $user;
}
