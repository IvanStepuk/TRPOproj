const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database');
const auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Простая сессия
const sessions = {};

// Функция для расчета приоритета студента
function calculatePriority(student) {
    // Балльная система для точного расчета
    let priorityScore = 0;
    
    // 1. Средний балл (максимальный вес - 1000 баллов)
    priorityScore += student.average_grade * 100;
    
    // 2. Общественная нагрузка (значительный бонус - 50 баллов)
    if (student.social_activity) {
        priorityScore += 50;
    }
    
    // 3. Доход на члена семьи (чем меньше доход - тем выше приоритет)
    const incomePerMember = student.family_income / student.family_members;
    if (incomePerMember <= 100) priorityScore += 40;
    else if (incomePerMember <= 300) priorityScore += 30;
    else if (incomePerMember <= 500) priorityScore += 20;
    else if (incomePerMember <= 1000) priorityScore += 10;
    
    // 4. Дата заявки (чем раньше - тем выше приоритет)
    const applicationDate = new Date(student.application_date);
    const daysDiff = Math.floor((new Date() - applicationDate) / (1000 * 60 * 60 * 24));
    priorityScore += Math.max(0, 30 - daysDiff); // Максимум 30 баллов за раннюю заявку
    
    return priorityScore;
}

// API endpoints

// Авторизация
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    auth.authenticate(username, password, (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Неверные учетные данные' });
        }
        
        const sessionId = Math.random().toString(36).substring(2);
        sessions[sessionId] = { user };
        
        res.json({ 
            success: true, 
            sessionId,
            user: { username: user.username, role: user.role }
        });
    });
});

// Получение списка студентов (публичный доступ)
app.get('/api/students', (req, res) => {
    const { search } = req.query;
    
    let query = `
        SELECT s.*, 
               d.name as dormitory_name,
               (s.family_income / s.family_members) as income_per_member,
               (s.average_grade * 100 + 
                CASE WHEN s.social_activity THEN 50 ELSE 0 END +
                CASE 
                    WHEN (s.family_income / s.family_members) <= 100 THEN 40
                    WHEN (s.family_income / s.family_members) <= 300 THEN 30
                    WHEN (s.family_income / s.family_members) <= 500 THEN 20
                    WHEN (s.family_income / s.family_members) <= 1000 THEN 10
                    ELSE 0
                END +
                (30 - CAST((julianday('now') - julianday(s.application_date)) AS INTEGER))
               ) as priority_score,
               (CASE 
                   WHEN s.status = 'waiting' THEN 
                       RANK() OVER (ORDER BY 
                           (s.average_grade * 100 + 
                            CASE WHEN s.social_activity THEN 50 ELSE 0 END +
                            CASE 
                                WHEN (s.family_income / s.family_members) <= 100 THEN 40
                                WHEN (s.family_income / s.family_members) <= 300 THEN 30
                                WHEN (s.family_income / s.family_members) <= 500 THEN 20
                                WHEN (s.family_income / s.family_members) <= 1000 THEN 10
                                ELSE 0
                            END +
                            (30 - CAST((julianday('now') - julianday(s.application_date)) AS INTEGER))
                           ) DESC,
                           s.application_date ASC)
                   ELSE NULL 
               END) as queue_position
        FROM students s
        LEFT JOIN dormitories d ON s.dormitory_id = d.id
    `;
    
    let params = [];
    
    if (search) {
        query += ' WHERE s.full_name LIKE ?';
        params.push(`%${search}%`);
    }
    
    query += ' ORDER BY s.status, queue_position';
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Получение списка общежитий
app.get('/api/dormitories', (req, res) => {
    db.all("SELECT * FROM dormitories", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Получение отчета о свободных местах
app.get('/api/reports/free-places', (req, res) => {
    db.all(`
        SELECT 
            d.id,
            d.name,
            d.type,
            d.total_places,
            d.occupied_places,
            (d.total_places - d.occupied_places) as free_places
        FROM dormitories d
        ORDER BY d.name
    `, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Получение отчета об очереди
app.get('/api/reports/queue', (req, res) => {
    db.all(`
        SELECT 
            s.id,
            s.full_name,
            (s.family_income / s.family_members) as income_per_member,
            s.average_grade,
            s.social_activity,
            s.application_date,
            (s.average_grade * 100 + 
             CASE WHEN s.social_activity THEN 50 ELSE 0 END +
             CASE 
                 WHEN (s.family_income / s.family_members) <= 100 THEN 40
                 WHEN (s.family_income / s.family_members) <= 300 THEN 30
                 WHEN (s.family_income / s.family_members) <= 500 THEN 20
                 WHEN (s.family_income / s.family_members) <= 1000 THEN 10
                 ELSE 0
             END +
             (30 - CAST((julianday('now') - julianday(s.application_date)) AS INTEGER))
            ) as priority_score,
            RANK() OVER (ORDER BY 
                (s.average_grade * 100 + 
                 CASE WHEN s.social_activity THEN 50 ELSE 0 END +
                 CASE 
                     WHEN (s.family_income / s.family_members) <= 100 THEN 40
                     WHEN (s.family_income / s.family_members) <= 300 THEN 30
                     WHEN (s.family_income / s.family_members) <= 500 THEN 20
                     WHEN (s.family_income / s.family_members) <= 1000 THEN 10
                     ELSE 0
                 END +
                 (30 - CAST((julianday('now') - julianday(s.application_date)) AS INTEGER))
                ) DESC,
                s.application_date ASC) as queue_position
        FROM students s
        WHERE s.status = 'waiting'
        ORDER BY queue_position
    `, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Регистрация новой заявки
app.post('/api/students', (req, res) => {
    const { full_name, family_income, family_members, average_grade, social_activity } = req.body;
    
    if (!full_name || !family_income || !family_members || !average_grade) {
        return res.status(400).json({ error: 'Все обязательные поля должны быть заполнены' });
    }
    
    const query = `
        INSERT INTO students (full_name, family_income, family_members, average_grade, social_activity)
        VALUES (?, ?, ?, ?, ?)
    `;
    
    db.run(query, [full_name, family_income, family_members, average_grade, social_activity ? 1 : 0], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ 
            success: true, 
            id: this.lastID,
            message: 'Заявка успешно зарегистрирована'
        });
    });
});

// Заселение студента
app.post('/api/students/:id/accommodate', (req, res) => {
    const studentId = req.params.id;
    const { dormitory_id } = req.body;
    
    if (!dormitory_id) {
        return res.status(400).json({ error: 'Необходимо указать общежитие' });
    }
    
    // Проверяем, есть ли свободные места
    db.get("SELECT total_places, occupied_places FROM dormitories WHERE id = ?", [dormitory_id], (err, dorm) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (!dorm) {
            return res.status(404).json({ error: 'Общежитие не найдено' });
        }
        
        if (dorm.occupied_places >= dorm.total_places) {
            return res.status(400).json({ error: 'В выбранном общежитии нет свободных мест' });
        }
        
        // Обновляем статус студента и занимаем место
        db.serialize(() => {
            db.run("UPDATE students SET status = 'accommodated', dormitory_id = ? WHERE id = ?", 
                   [dormitory_id, studentId]);
            
            db.run("UPDATE dormitories SET occupied_places = occupied_places + 1 WHERE id = ?", [dormitory_id]);
            
            res.json({ success: true, message: 'Студент успешно заселен' });
        });
    });
});

// Выселение студента
app.post('/api/students/:id/evict', (req, res) => {
    const studentId = req.params.id;
    
    db.get("SELECT dormitory_id FROM students WHERE id = ?", [studentId], (err, student) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (!student) {
            return res.status(404).json({ error: 'Студент не найден' });
        }
        
        // Освобождаем место и обновляем статус студента
        db.serialize(() => {
            if (student.dormitory_id) {
                db.run("UPDATE dormitories SET occupied_places = occupied_places - 1 WHERE id = ?", [student.dormitory_id]);
            }
            
            db.run("UPDATE students SET status = 'waiting', dormitory_id = NULL WHERE id = ?", [studentId]);
            
            res.json({ success: true, message: 'Студент успешно выселен' });
        });
    });
});

// Получение следующего кандидата для заселения
app.get('/api/students/next-candidate', (req, res) => {
    db.get(`
        SELECT s.*, 
               (s.family_income / s.family_members) as income_per_member,
               (s.average_grade * 100 + 
                CASE WHEN s.social_activity THEN 50 ELSE 0 END +
                CASE 
                    WHEN (s.family_income / s.family_members) <= 100 THEN 40
                    WHEN (s.family_income / s.family_members) <= 300 THEN 30
                    WHEN (s.family_income / s.family_members) <= 500 THEN 20
                    WHEN (s.family_income / s.family_members) <= 1000 THEN 10
                    ELSE 0
                END +
                (30 - CAST((julianday('now') - julianday(s.application_date)) AS INTEGER))
               ) as priority_score
        FROM students s
        WHERE s.status = 'waiting'
        ORDER BY 
            priority_score DESC,
            s.application_date ASC
        LIMIT 1
    `, (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(row || {});
    });
});

// Получение детальной информации о приоритете студента (для отладки)
app.get('/api/students/:id/priority-info', (req, res) => {
    const studentId = req.params.id;
    
    db.get(`
        SELECT 
            s.*,
            (s.family_income / s.family_members) as income_per_member,
            (s.average_grade * 100) as grade_score,
            (CASE WHEN s.social_activity THEN 50 ELSE 0 END) as social_score,
            (CASE 
                WHEN (s.family_income / s.family_members) <= 100 THEN 40
                WHEN (s.family_income / s.family_members) <= 300 THEN 30
                WHEN (s.family_income / s.family_members) <= 500 THEN 20
                WHEN (s.family_income / s.family_members) <= 1000 THEN 10
                ELSE 0
            END) as income_score,
            (30 - CAST((julianday('now') - julianday(s.application_date)) AS INTEGER)) as date_score,
            (s.average_grade * 100 + 
             CASE WHEN s.social_activity THEN 50 ELSE 0 END +
             CASE 
                 WHEN (s.family_income / s.family_members) <= 100 THEN 40
                 WHEN (s.family_income / s.family_members) <= 300 THEN 30
                 WHEN (s.family_income / s.family_members) <= 500 THEN 20
                 WHEN (s.family_income / s.family_members) <= 1000 THEN 10
                 ELSE 0
             END +
             (30 - CAST((julianday('now') - julianday(s.application_date)) AS INTEGER))
            ) as total_priority_score
        FROM students s
        WHERE s.id = ?
    `, [studentId], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (!row) {
            return res.status(404).json({ error: 'Студент не найден' });
        }
        res.json(row);
    });
});

// Статические файлы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Откройте http://localhost:${PORT} в браузере`);
});