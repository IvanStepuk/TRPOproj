const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Инициализация базы данных
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Ошибка подключения к БД:', err.message);
    } else {
        console.log('Подключение к SQLite базе данных установлено');
        initializeDatabase();
    }
});

// Инициализация таблиц
function initializeDatabase() {
    // Таблица пользователей
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('student', 'admin')),
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица общежитий
    db.run(`CREATE TABLE IF NOT EXISTS dormitories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('family', 'single')),
        total_rooms INTEGER NOT NULL,
        occupied_rooms INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица заявок
    db.run(`CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        dormitory_type TEXT NOT NULL CHECK(dormitory_type IN ('family', 'single')),
        family_income REAL NOT NULL,
        average_grade REAL NOT NULL,
        social_activity BOOLEAN NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
        application_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        priority_score REAL DEFAULT 0,
        FOREIGN KEY (student_id) REFERENCES users (id)
    )`);

    // Таблица заселенных студентов
    db.run(`CREATE TABLE IF NOT EXISTS residents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        dormitory_id INTEGER NOT NULL,
        room_number TEXT NOT NULL,
        check_in_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        check_out_date DATETIME,
        FOREIGN KEY (student_id) REFERENCES users (id),
        FOREIGN KEY (dormitory_id) REFERENCES dormitories (id)
    )`);

    // Создание администратора по умолчанию
    const adminPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, role, full_name) 
            VALUES (?, ?, ?, ?)`, ['admin', adminPassword, 'admin', 'Администратор']);

    // Добавление тестовых общежитий
    db.run(`INSERT OR IGNORE INTO dormitories (name, type, total_rooms, occupied_rooms) 
            VALUES (?, ?, ?, ?)`, ['Общежитие №1', 'single', 100, 45]);
    db.run(`INSERT OR IGNORE INTO dormitories (name, type, total_rooms, occupied_rooms) 
            VALUES (?, ?, ?, ?)`, ['Общежитие №2', 'family', 50, 20]);
    db.run(`INSERT OR IGNORE INTO dormitories (name, type, total_rooms, occupied_rooms) 
            VALUES (?, ?, ?, ?)`, ['Общежитие №3', 'single', 80, 60]);

    console.log('База данных инициализирована');
}

// Функция расчета приоритетного балла
function calculatePriorityScore(income, grade, activity) {
    // Чем ниже доход - тем выше приоритет (макс 50 баллов)
    const incomeScore = Math.max(0, 50 - (income / 1000));
    // Чем выше средний балл - тем выше приоритет (макс 40 баллов)
    const gradeScore = grade * 8;
    // Наличие общественной нагрузки (10 баллов)
    const activityScore = activity ? 10 : 0;
    
    return incomeScore + gradeScore + activityScore;
}

// Маршруты API

// Регистрация
app.post('/api/register', (req, res) => {
    const { username, password, full_name, email, phone } = req.body;
    
    if (!username || !password || !full_name) {
        return res.status(400).json({ error: 'Все обязательные поля должны быть заполнены' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    
    db.run(`INSERT INTO users (username, password, role, full_name, email, phone) 
            VALUES (?, ?, 'student', ?, ?, ?)`,
        [username, hashedPassword, full_name, email, phone],
        function(err) {
            if (err) {
                res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
            } else {
                res.json({ message: 'Регистрация успешна', userId: this.lastID });
            }
        });
});

// Авторизация
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err) {
            res.status(500).json({ error: 'Ошибка сервера' });
        } else if (!user) {
            res.status(401).json({ error: 'Неверный логин или пароль' });
        } else if (!bcrypt.compareSync(password, user.password)) {
            res.status(401).json({ error: 'Неверный логин или пароль' });
        } else {
            res.json({ 
                message: 'Авторизация успешна',
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    full_name: user.full_name
                }
            });
        }
    });
});

// Подача заявки
app.post('/api/application', (req, res) => {
    const { student_id, dormitory_type, family_income, average_grade, social_activity } = req.body;
    
    // Проверка существующей заявки
    db.get(`SELECT * FROM applications WHERE student_id = ? AND status = 'pending'`, 
        [student_id], (err, existingApp) => {
        if (err) {
            res.status(500).json({ error: 'Ошибка сервера' });
        } else if (existingApp) {
            res.status(400).json({ error: 'У вас уже есть активная заявка' });
        } else {
            // Расчет приоритетного балла
            const priority_score = calculatePriorityScore(family_income, average_grade, social_activity);
            
            db.run(`INSERT INTO applications (student_id, dormitory_type, family_income, average_grade, social_activity, priority_score) 
                    VALUES (?, ?, ?, ?, ?, ?)`,
                [student_id, dormitory_type, family_income, average_grade, social_activity, priority_score],
                function(err) {
                    if (err) {
                        res.status(500).json({ error: 'Ошибка при подаче заявки' });
                    } else {
                        res.json({ message: 'Заявка подана успешно', applicationId: this.lastID });
                    }
                });
        }
    });
});

// Получение заявки студента
app.get('/api/application/:student_id', (req, res) => {
    const student_id = req.params.student_id;
    
    db.get(`SELECT a.*, u.full_name 
            FROM applications a 
            JOIN users u ON a.student_id = u.id 
            WHERE a.student_id = ? AND a.status != 'cancelled'
            ORDER BY a.application_date DESC
            LIMIT 1`,
        [student_id], (err, application) => {
        if (err) {
            res.status(500).json({ error: 'Ошибка сервера' });
        } else {
            res.json({ application });
        }
    });
});

// Получение позиции в очереди
app.get('/api/queue/position/:application_id', (req, res) => {
    const application_id = req.params.application_id;
    
    db.get(`SELECT priority_score, dormitory_type FROM applications WHERE id = ?`, [application_id], (err, app) => {
        if (err) {
            res.status(500).json({ error: 'Ошибка сервера' });
        } else if (!app) {
            res.status(404).json({ error: 'Заявка не найдена' });
        } else {
            db.get(`SELECT COUNT(*) as position 
                    FROM applications 
                    WHERE dormitory_type = ? 
                    AND status = 'pending' 
                    AND priority_score > ?`,
                [app.dormitory_type, app.priority_score], (err, result) => {
                if (err) {
                    res.status(500).json({ error: 'Ошибка сервера' });
                } else {
                    res.json({ position: result.position + 1 });
                }
            });
        }
    });
});

// Получение всех заявок (для администратора)
app.get('/api/applications', (req, res) => {
    db.all(`SELECT a.*, u.full_name, u.email, u.phone 
            FROM applications a 
            JOIN users u ON a.student_id = u.id 
            ORDER BY a.priority_score DESC`, (err, applications) => {
        if (err) {
            res.status(500).json({ error: 'Ошибка сервера' });
        } else {
            res.json({ applications });
        }
    });
});

// Обновление заявки
app.put('/api/application/:id', (req, res) => {
    const application_id = req.params.id;
    const { dormitory_type, family_income, average_grade, social_activity } = req.body;
    
    const priority_score = calculatePriorityScore(family_income, average_grade, social_activity);
    
    db.run(`UPDATE applications 
            SET dormitory_type = ?, family_income = ?, average_grade = ?, social_activity = ?, priority_score = ?
            WHERE id = ?`,
        [dormitory_type, family_income, average_grade, social_activity, priority_score, application_id],
        function(err) {
            if (err) {
                res.status(500).json({ error: 'Ошибка при обновлении заявки' });
            } else {
                res.json({ message: 'Заявка обновлена' });
            }
        });
});

// Отмена заявки
app.put('/api/application/:id/cancel', (req, res) => {
    const application_id = req.params.id;
    
    db.run(`UPDATE applications SET status = 'cancelled' WHERE id = ?`,
        [application_id], function(err) {
        if (err) {
            res.status(500).json({ error: 'Ошибка при отмене заявки' });
        } else {
            res.json({ message: 'Заявка отменена' });
        }
    });
});

// Получение информации об общежитиях
app.get('/api/dormitories', (req, res) => {
    db.all(`SELECT * FROM dormitories`, (err, dormitories) => {
        if (err) {
            res.status(500).json({ error: 'Ошибка сервера' });
        } else {
            res.json({ dormitories });
        }
    });
});

// Заселение студента
app.post('/api/check-in', (req, res) => {
    const { application_id, dormitory_id, room_number } = req.body;
    
    // Получение информации о заявке
    db.get(`SELECT * FROM applications WHERE id = ?`, [application_id], (err, application) => {
        if (err) {
            res.status(500).json({ error: 'Ошибка сервера' });
        } else if (!application) {
            res.status(404).json({ error: 'Заявка не найдена' });
        } else {
            // Заселение
            db.run(`INSERT INTO residents (student_id, dormitory_id, room_number) VALUES (?, ?, ?)`,
                [application.student_id, dormitory_id, room_number], function(err) {
                if (err) {
                    res.status(500).json({ error: 'Ошибка при заселении' });
                } else {
                    // Обновление статуса заявки
                    db.run(`UPDATE applications SET status = 'approved' WHERE id = ?`, [application_id]);
                    // Обновление счетчика занятых комнат
                    db.run(`UPDATE dormitories SET occupied_rooms = occupied_rooms + 1 WHERE id = ?`, [dormitory_id]);
                    res.json({ message: 'Студент заселен' });
                }
            });
        }
    });
});

// Выселение студента
app.post('/api/check-out', (req, res) => {
    const { resident_id } = req.body;
    
    db.get(`SELECT * FROM residents WHERE id = ? AND check_out_date IS NULL`, [resident_id], (err, resident) => {
        if (err) {
            res.status(500).json({ error: 'Ошибка сервера' });
        } else if (!resident) {
            res.status(404).json({ error: 'Проживающий не найден' });
        } else {
            db.run(`UPDATE residents SET check_out_date = CURRENT_TIMESTAMP WHERE id = ?`, [resident_id], function(err) {
                if (err) {
                    res.status(500).json({ error: 'Ошибка при выселении' });
                } else {
                    db.run(`UPDATE dormitories SET occupied_rooms = occupied_rooms - 1 WHERE id = ?`, [resident.dormitory_id]);
                    res.json({ message: 'Студент выселен' });
                }
            });
        }
    });
});

// Получение списка проживающих
app.get('/api/residents', (req, res) => {
    db.all(`SELECT r.*, u.full_name, d.name as dormitory_name 
            FROM residents r 
            JOIN users u ON r.student_id = u.id 
            JOIN dormitories d ON r.dormitory_id = d.id 
            WHERE r.check_out_date IS NULL`, (err, residents) => {
        if (err) {
            res.status(500).json({ error: 'Ошибка сервера' });
        } else {
            res.json({ residents });
        }
    });
});

// Базовый маршрут
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
    console.log('Данные для входа:');
    console.log('Администратор - логин: admin, пароль: admin123');
});