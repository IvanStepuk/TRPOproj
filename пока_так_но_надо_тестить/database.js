const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'student_housing.db');

// Создание подключения к базе данных
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Ошибка подключения к базе данных:', err.message);
    } else {
        console.log('Подключение к SQLite базе данных установлено.');
        initializeDatabase();
    }
});

// Инициализация базы данных
function initializeDatabase() {
    // Создание таблицы пользователей
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'admin'
    )`);

    // Создание таблицы общежитий
    db.run(`CREATE TABLE IF NOT EXISTS dormitories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT CHECK(type IN ('family', 'non_family')) NOT NULL,
        total_places INTEGER NOT NULL,
        occupied_places INTEGER DEFAULT 0
    )`);

    // Создание таблицы студентов
    db.run(`CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        family_income REAL NOT NULL,
        family_members INTEGER NOT NULL,
        average_grade REAL NOT NULL,
        social_activity BOOLEAN DEFAULT FALSE,
        application_date DATE DEFAULT CURRENT_DATE,
        status TEXT CHECK(status IN ('waiting', 'accommodated')) DEFAULT 'waiting',
        dormitory_id INTEGER,
        room_number TEXT,
        FOREIGN KEY (dormitory_id) REFERENCES dormitories (id)
    )`);

    // Добавление администратора по умолчанию (пароль НЕ шифруется)
    const defaultPassword = 'admin123'; // Пароль в чистом виде
    
    db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
        if (!row) {
            db.run("INSERT INTO users (username, password) VALUES (?, ?)", ['admin', defaultPassword]);
            console.log('Создан администратор: admin / admin123');
        }
    });

    // Добавление тестовых данных общежитий
    db.get("SELECT COUNT(*) as count FROM dormitories", (err, row) => {
        if (row.count === 0) {
            db.run("INSERT INTO dormitories (name, type, total_places) VALUES (?, ?, ?)", 
                   ['Общежитие №1', 'non_family', 100]);
            db.run("INSERT INTO dormitories (name, type, total_places) VALUES (?, ?, ?)", 
                   ['Общежитие №2', 'non_family', 150]);
            db.run("INSERT INTO dormitories (name, type, total_places) VALUES (?, ?, ?)", 
                   ['Семейное общежитие', 'family', 50]);
            console.log('Добавлены тестовые общежития');
        }
    });
}

module.exports = db;