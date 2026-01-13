const db = require('./database');

// Функция аутентификации
function authenticate(username, password, callback) {
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) {
            return callback(err, null);
        }
        if (!user) {
            return callback(null, null);
        }
        
        // Прямое сравнение паролей (в реальном приложении используйте хеширование!)
        const isValid = (password === user.password);
        if (isValid) {
            // Возвращаем только необходимые данные о пользователе
            callback(null, {
                id: user.id,
                username: user.username,
                role: user.role || 'admin'
            });
        } else {
            callback(null, null);
        }
    });
}

// Функция проверки сессии
function verifySession(sessionId, sessions, callback) {
    if (!sessionId || !sessions[sessionId]) {
        return callback(null, false);
    }
    
    const session = sessions[sessionId];
    const now = new Date();
    
    // Проверяем, не истекла ли сессия (24 часа)
    if (now - session.createdAt > 24 * 60 * 60 * 1000) {
        delete sessions[sessionId];
        return callback(null, false);
    }
    
    // Обновляем время последней активности
    session.lastActivity = now;
    
    callback(null, {
        valid: true,
        user: session.user
    });
}

module.exports = {
    authenticate,
    verifySession
};
