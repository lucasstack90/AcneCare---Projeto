<?php
declare(strict_types=1);

session_start();
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'session':
            requireMethod('GET');
            jsonResponse([
                'ok' => true,
                'user' => $_SESSION['user'] ?? null
            ]);

        case 'register':
            requireMethod('POST');
            $name = trim($_POST['name'] ?? '');
            $email = trim(strtolower($_POST['email'] ?? ''));
            $password = $_POST['password'] ?? '';

            if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 6) {
                jsonResponse(['ok' => false, 'message' => 'Preencha os dados corretamente. A senha deve ter pelo menos 6 caracteres.'], 422);
            }

            $stmt = db()->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
            $stmt->execute([$email]);

            if ($stmt->fetch()) {
                jsonResponse(['ok' => false, 'message' => 'Este e-mail já está cadastrado.'], 409);
            }

            $stmt = db()->prepare(
                'INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, "user", NOW())'
            );
            $stmt->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);

            $id = (int)db()->lastInsertId();
            $_SESSION['user'] = [
                'id' => $id,
                'name' => $name,
                'email' => $email,
                'role' => 'user'
            ];

            jsonResponse(['ok' => true, 'user' => $_SESSION['user']]);

        case 'login':
            requireMethod('POST');
            $email = trim(strtolower($_POST['email'] ?? ''));
            $password = $_POST['password'] ?? '';

            $stmt = db()->prepare('SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1');
            $stmt->execute([$email]);
            $user = $stmt->fetch();

            if (!$user || !password_verify($password, $user['password_hash'])) {
                jsonResponse(['ok' => false, 'message' => 'E-mail ou senha incorretos.'], 401);
            }

            $_SESSION['user'] = [
                'id' => (int)$user['id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'role' => $user['role']
            ];

            jsonResponse(['ok' => true, 'user' => $_SESSION['user']]);

        case 'logout':
            requireMethod('POST');
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $params = session_get_cookie_params();
                setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
            }
            session_destroy();
            jsonResponse(['ok' => true]);

        case 'posts':
            requireMethod('GET');
            $user = $_SESSION['user'] ?? null;

            // Público: somente aprovadas.
            if (!$user) {
                $stmt = db()->query(
                    "SELECT id, title, category, description, media_url AS mediaURL,
                            media_type AS mediaType, created_at AS createdAt
                     FROM posts WHERE status = 'aprovado' ORDER BY created_at DESC"
                );
                jsonResponse(['ok' => true, 'posts' => $stmt->fetchAll()]);
            }

            // Admin: todas as pendentes para revisão.
            if ($user['role'] === 'admin') {
                $stmt = db()->query(
                    "SELECT id, title, category, description, media_url AS mediaURL,
                            media_type AS mediaType, author_email AS authorEmail,
                            status, created_at AS createdAt
                     FROM posts WHERE status = 'pendente' ORDER BY created_at DESC"
                );
                jsonResponse(['ok' => true, 'posts' => $stmt->fetchAll()]);
            }

            // Usuário comum: aprovadas + próprias postagens.
            $stmt = db()->prepare(
                "SELECT id, title, category, description, media_url AS mediaURL,
                        media_type AS mediaType, status, created_at AS createdAt
                 FROM posts
                 WHERE status = 'aprovado' OR author_id = ?
                 ORDER BY created_at DESC"
            );
            $stmt->execute([(int)$user['id']]);
            jsonResponse(['ok' => true, 'posts' => $stmt->fetchAll()]);

        case 'my_posts':
            requireMethod('GET');
            $user = requireLogin();

            $stmt = db()->prepare(
                "SELECT id, title, status, created_at AS createdAt
                 FROM posts WHERE author_id = ? ORDER BY created_at DESC"
            );
            $stmt->execute([(int)$user['id']]);
            jsonResponse(['ok' => true, 'posts' => $stmt->fetchAll()]);

        case 'create_post':
            requireMethod('POST');
            $user = requireLogin();

            $title = trim($_POST['title'] ?? '');
            $category = trim($_POST['category'] ?? '');
            $description = trim($_POST['description'] ?? '');

            $validCategories = ['Farmácia', 'Estética', 'Enfermagem'];

            if ($title === '' || $description === '' || !in_array($category, $validCategories, true)) {
                jsonResponse(['ok' => false, 'message' => 'Preencha título, categoria e descrição.'], 422);
            }

            if (!isset($_FILES['media']) || $_FILES['media']['error'] !== UPLOAD_ERR_OK) {
                jsonResponse(['ok' => false, 'message' => 'Envie uma imagem ou vídeo válido.'], 422);
            }

            $file = $_FILES['media'];

            if ($file['size'] > MAX_FILE_SIZE) {
                jsonResponse(['ok' => false, 'message' => 'O arquivo ultrapassa o limite de 15 MB.'], 422);
            }

            $finfo = new finfo(FILEINFO_MIME_TYPE);
            $mime = $finfo->file($file['tmp_name']);

            if (in_array($mime, ALLOWED_IMAGE_TYPES, true)) {
                $mediaType = 'image';
                $extension = match ($mime) {
                    'image/jpeg' => 'jpg',
                    'image/png' => 'png',
                    'image/gif' => 'gif',
                    'image/webp' => 'webp',
                    default => 'bin'
                };
            } elseif (in_array($mime, ALLOWED_VIDEO_TYPES, true)) {
                $mediaType = 'video';
                $extension = match ($mime) {
                    'video/mp4' => 'mp4',
                    'video/webm' => 'webm',
                    'video/ogg' => 'ogg',
                    default => 'bin'
                };
            } else {
                jsonResponse(['ok' => false, 'message' => 'Tipo de arquivo não permitido. Use imagem ou vídeo.'], 422);
            }

            $uploadDir = __DIR__ . '/uploads';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            $filename = bin2hex(random_bytes(16)) . '.' . $extension;
            $destination = $uploadDir . '/' . $filename;

            if (!move_uploaded_file($file['tmp_name'], $destination)) {
                jsonResponse(['ok' => false, 'message' => 'Não foi possível salvar o arquivo.'], 500);
            }

            $mediaUrl = 'uploads/' . $filename;

            $stmt = db()->prepare(
                'INSERT INTO posts
                (title, category, description, media_url, media_type, author_id, author_email, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, "pendente", NOW())'
            );
            $stmt->execute([
                $title, $category, $description, $mediaUrl, $mediaType,
                (int)$user['id'], $user['email']
            ]);

            jsonResponse(['ok' => true, 'message' => 'Postagem enviada para aprovação.']);

        case 'review':
            requireMethod('POST');
            $user = requireAdmin();

            $postId = (int)($_POST['post_id'] ?? 0);
            $status = $_POST['status'] ?? '';

            if ($postId <= 0 || !in_array($status, ['aprovado', 'rejeitado'], true)) {
                jsonResponse(['ok' => false, 'message' => 'Dados de revisão inválidos.'], 422);
            }

            $stmt = db()->prepare(
                'UPDATE posts SET status = ?, reviewed_at = NOW(), reviewed_by = ? WHERE id = ?'
            );
            $stmt->execute([$status, (int)$user['id'], $postId]);

            jsonResponse(['ok' => true]);

        default:
            jsonResponse(['ok' => false, 'message' => 'Ação não encontrada.'], 404);
    }
} catch (Throwable $e) {
    error_log($e->getMessage());
    jsonResponse(['ok' => false, 'message' => 'Erro interno do servidor. Verifique a configuração do banco de dados.'], 500);
}
