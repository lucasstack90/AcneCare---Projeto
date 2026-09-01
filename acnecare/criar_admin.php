<?php
// Execute UMA vez pelo navegador: http://localhost/acnecare/criar_admin.php
// Depois, apague este arquivo por segurança.

declare(strict_types=1);

require_once __DIR__ . '/config.php';

$message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = trim($_POST['name'] ?? '');
    $email = trim(strtolower($_POST['email'] ?? ''));
    $password = $_POST['password'] ?? '';

    if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 6) {
        $message = 'Preencha nome, e-mail válido e senha com pelo menos 6 caracteres.';
    } else {
        $stmt = db()->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);

        if ($stmt->fetch()) {
            $message = 'Esse e-mail já existe. Faça login e altere a role diretamente no banco, se necessário.';
        } else {
            $stmt = db()->prepare(
                'INSERT INTO users (name, email, password_hash, role, created_at)
                 VALUES (?, ?, ?, "admin", NOW())'
            );
            $stmt->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
            $message = 'Administrador criado com sucesso. Agora apague o arquivo criar_admin.php.';
        }
    }
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>AcneCare - Criar administrador</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:Arial,sans-serif;max-width:520px;margin:50px auto;padding:20px}
input,button{width:100%;padding:12px;margin:8px 0;box-sizing:border-box}
button{cursor:pointer}
.msg{padding:12px;background:#eee;margin-bottom:15px}
</style>
</head>
<body>
<h1>Criar administrador</h1>
<?php if ($message): ?><div class="msg"><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
<form method="post">
    <input name="name" placeholder="Nome" required>
    <input type="email" name="email" placeholder="E-mail" required>
    <input type="password" name="password" placeholder="Senha (mín. 6 caracteres)" minlength="6" required>
    <button type="submit">Criar administrador</button>
</form>
</body>
</html>
