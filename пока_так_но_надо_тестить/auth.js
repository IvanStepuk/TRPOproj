const db = require('./database');

// Функция аутентификации (без шифрования паролей)
function authenticate(username, password, callback) {
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) {
            return callback(err, null);
        }
        if (!user) {
            return callback(null, null);
        }
        
        // Прямое сравнение паролей без шифрования
        const isValid = (password === user.password);
        if (isValid) {
            callback(null, user);
        } else {
            callback(null, null);
        }
    });
}

module.exports = {
    authenticate
};