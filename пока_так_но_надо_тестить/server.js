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

// Получение списка студентов (публичный доступ) - ОБНОВЛЕНО
app.get('/api/students', (req, res) => {
    const { search, status } = req.query;
    
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
    
    let conditions = [];
    let params = [];
    
    if (status) {
        if (status === 'accommodated') {
            conditions.push('s.status = ?');
            params.push('accommodated');
        } else if (status === 'waiting') {
            conditions.push('s.status = ?');
            params.push('waiting');
        }
    }
    
    if (search) {
        conditions.push('s.full_name LIKE ?');
        params.push(`%${search}%`);
    }
    
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
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

// Получение отчета о заселенных студентах
app.get('/api/reports/accommodated', (req, res) => {
    db.all(`
        SELECT 
            s.id,
            s.full_name,
            s.average_grade,
            s.social_activity,
            s.application_date,
            d.name as dormitory_name,
            d.type as dormitory_type
        FROM students s
        LEFT JOIN dormitories d ON s.dormitory_id = d.id
        WHERE s.status = 'accommodated'
        ORDER BY s.full_name
    `, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Экспорт отчета в TXT формате
app.get('/api/export/:reportType/txt', (req, res) => {
    const { reportType } = req.params;
    let query = '';
    
    switch(reportType) {
        case 'free-places':
            query = `
                SELECT 
                    d.name,
                    d.type,
                    d.total_places,
                    d.occupied_places,
                    (d.total_places - d.occupied_places) as free_places
                FROM dormitories d
                ORDER BY d.name
            `;
            break;
            
        case 'queue':
            query = `
                SELECT 
                    s.full_name,
                    (s.family_income / s.family_members) as income_per_member,
                    s.average_grade,
                    s.social_activity,
                    s.application_date,
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
            `;
            break;
            
        case 'accommodated':
            query = `
                SELECT 
                    s.full_name,
                    s.average_grade,
                    s.social_activity,
                    s.application_date,
                    d.name as dormitory_name,
                    d.type as dormitory_type
                FROM students s
                LEFT JOIN dormitories d ON s.dormitory_id = d.id
                WHERE s.status = 'accommodated'
                ORDER BY s.full_name
            `;
            break;
            
        case 'all':
            // Экспорт всех отчетов
            exportAllReports(res);
            return;
            
        default:
            return res.status(400).json({ error: 'Неверный тип отчета' });
    }
    
    db.all(query, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        const fileName = `report_${reportType}_${new Date().toISOString().slice(0,10)}.txt`;
        const reportText = generateTxtReport(rows, reportType);
        
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(reportText);
    });
});

// Экспорт отчета в DOCX формате (простейшая реализация в виде HTML)
app.get('/api/export/:reportType/docx', (req, res) => {
    const { reportType } = req.params;
    let query = '';
    
    switch(reportType) {
        case 'free-places':
            query = `
                SELECT 
                    d.name,
                    d.type,
                    d.total_places,
                    d.occupied_places,
                    (d.total_places - d.occupied_places) as free_places
                FROM dormitories d
                ORDER BY d.name
            `;
            break;
            
        case 'queue':
            query = `
                SELECT 
                    s.full_name,
                    (s.family_income / s.family_members) as income_per_member,
                    s.average_grade,
                    s.social_activity,
                    s.application_date,
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
            `;
            break;
            
        case 'accommodated':
            query = `
                SELECT 
                    s.full_name,
                    s.average_grade,
                    s.social_activity,
                    s.application_date,
                    d.name as dormitory_name,
                    d.type as dormitory_type
                FROM students s
                LEFT JOIN dormitories d ON s.dormitory_id = d.id
                WHERE s.status = 'accommodated'
                ORDER BY s.full_name
            `;
            break;
            
        case 'all':
            // Экспорт всех отчетов
            exportAllReportsDocx(res);
            return;
            
        default:
            return res.status(400).json({ error: 'Неверный тип отчета' });
    }
    
    db.all(query, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        const fileName = `report_${reportType}_${new Date().toISOString().slice(0,10)}.html`;
        const reportHtml = generateDocxReport(rows, reportType);
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(reportHtml);
    });
});

// Функция для экспорта всех отчетов в TXT
function exportAllReports(res) {
    const queries = {
        'free-places': `SELECT d.name, d.type, d.total_places, d.occupied_places, (d.total_places - d.occupied_places) as free_places FROM dormitories d ORDER BY d.name`,
        'queue': `SELECT s.full_name, (s.family_income / s.family_members) as income_per_member, s.average_grade, s.social_activity, s.application_date, RANK() OVER (ORDER BY (s.average_grade * 100 + CASE WHEN s.social_activity THEN 50 ELSE 0 END + CASE WHEN (s.family_income / s.family_members) <= 100 THEN 40 WHEN (s.family_income / s.family_members) <= 300 THEN 30 WHEN (s.family_income / s.family_members) <= 500 THEN 20 WHEN (s.family_income / s.family_members) <= 1000 THEN 10 ELSE 0 END + (30 - CAST((julianday('now') - julianday(s.application_date)) AS INTEGER))) DESC, s.application_date ASC) as queue_position FROM students s WHERE s.status = 'waiting' ORDER BY queue_position`,
        'accommodated': `SELECT s.full_name, s.average_grade, s.social_activity, s.application_date, d.name as dormitory_name, d.type as dormitory_type FROM students s LEFT JOIN dormitories d ON s.dormitory_id = d.id WHERE s.status = 'accommodated' ORDER BY s.full_name`
    };
    
    const results = {};
    let completed = 0;
    
    Object.keys(queries).forEach(reportType => {
        db.all(queries[reportType], (err, rows) => {
            if (err) {
                console.error(`Error fetching ${reportType}:`, err);
            } else {
                results[reportType] = rows;
            }
            
            completed++;
            
            if (completed === Object.keys(queries).length) {
                const fileName = `all_reports_${new Date().toISOString().slice(0,10)}.txt`;
                const reportText = generateAllReportsTxt(results);
                
                res.setHeader('Content-Type', 'text/plain');
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                res.send(reportText);
            }
        });
    });
}

// Функция для экспорта всех отчетов в DOCX
function exportAllReportsDocx(res) {
    const queries = {
        'free-places': `SELECT d.name, d.type, d.total_places, d.occupied_places, (d.total_places - d.occupied_places) as free_places FROM dormitories d ORDER BY d.name`,
        'queue': `SELECT s.full_name, (s.family_income / s.family_members) as income_per_member, s.average_grade, s.social_activity, s.application_date, RANK() OVER (ORDER BY (s.average_grade * 100 + CASE WHEN s.social_activity THEN 50 ELSE 0 END + CASE WHEN (s.family_income / s.family_members) <= 100 THEN 40 WHEN (s.family_income / s.family_members) <= 300 THEN 30 WHEN (s.family_income / s.family_members) <= 500 THEN 20 WHEN (s.family_income / s.family_members) <= 1000 THEN 10 ELSE 0 END + (30 - CAST((julianday('now') - julianday(s.application_date)) AS INTEGER))) DESC, s.application_date ASC) as queue_position FROM students s WHERE s.status = 'waiting' ORDER BY queue_position`,
        'accommodated': `SELECT s.full_name, s.average_grade, s.social_activity, s.application_date, d.name as dormitory_name, d.type as dormitory_type FROM students s LEFT JOIN dormitories d ON s.dormitory_id = d.id WHERE s.status = 'accommodated' ORDER BY s.full_name`
    };
    
    const results = {};
    let completed = 0;
    
    Object.keys(queries).forEach(reportType => {
        db.all(queries[reportType], (err, rows) => {
            if (err) {
                console.error(`Error fetching ${reportType}:`, err);
            } else {
                results[reportType] = rows;
            }
            
            completed++;
            
            if (completed === Object.keys(queries).length) {
                const fileName = `all_reports_${new Date().toISOString().slice(0,10)}.html`;
                const reportHtml = generateAllReportsDocx(results);
                
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                res.send(reportHtml);
            }
        });
    });
}

// Генерация TXT отчета
function generateTxtReport(rows, reportType) {
    let report = '';
    const now = new Date();
    
    switch(reportType) {
        case 'free-places':
            report += 'ОТЧЕТ О СВОБОДНЫХ МЕСТАХ В ОБЩЕЖИТИЯХ\n';
            report += '========================================\n';
            report += `Дата формирования: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}\n\n`;
            report += 'Общежитие | Тип | Всего мест | Занято | Свободно\n';
            report += '-------------------------------------------------\n';
            
            rows.forEach(row => {
                const type = row.type === 'family' ? 'Семейное' : 'Несемейное';
                report += `${row.name} | ${type} | ${row.total_places} | ${row.occupied_places} | ${row.free_places}\n`;
            });
            
            const totalFree = rows.reduce((sum, row) => sum + row.free_places, 0);
            const totalOccupied = rows.reduce((sum, row) => sum + row.occupied_places, 0);
            const totalPlaces = rows.reduce((sum, row) => sum + row.total_places, 0);
            
            report += '\n========================================\n';
            report += `ИТОГО: Всего мест: ${totalPlaces}, Занято: ${totalOccupied}, Свободно: ${totalFree}\n`;
            break;
            
        case 'queue':
            report += 'ОТЧЕТ ОБ ОЧЕРЕДИ НА ЗАСЕЛЕНИЕ\n';
            report += '================================\n';
            report += `Дата формирования: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}\n\n`;
            report += 'Позиция | ФИО | Доход на члена семьи | Средний балл | Общественная нагрузка | Дата заявки\n';
            report += '-----------------------------------------------------------------------------------------\n';
            
            rows.forEach(row => {
                const social = row.social_activity ? 'Да' : 'Нет';
                const date = new Date(row.application_date).toLocaleDateString();
                report += `${row.queue_position} | ${row.full_name} | ${row.income_per_member.toFixed(2)} | ${row.average_grade} | ${social} | ${date}\n`;
            });
            
            report += '\n================================\n';
            report += `ИТОГО: ${rows.length} студентов в очереди\n`;
            break;
            
        case 'accommodated':
            report += 'ОТЧЕТ О ЗАСЕЛЕННЫХ СТУДЕНТАХ\n';
            report += '=============================\n';
            report += `Дата формирования: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}\n\n`;
            report += 'ФИО | Средний балл | Общественная нагрузка | Дата заявки | Общежитие | Тип общежития\n';
            report += '------------------------------------------------------------------------------------\n';
            
            rows.forEach(row => {
                const social = row.social_activity ? 'Да' : 'Нет';
                const date = new Date(row.application_date).toLocaleDateString();
                const dormType = row.dormitory_type === 'family' ? 'Семейное' : 'Несемейное';
                report += `${row.full_name} | ${row.average_grade} | ${social} | ${date} | ${row.dormitory_name || 'Нет'} | ${dormType}\n`;
            });
            
            report += '\n=============================\n';
            report += `ИТОГО: ${rows.length} студентов заселено\n`;
            break;
    }
    
    return report;
}

// Генерация DOCX отчета (простой HTML)
function generateDocxReport(rows, reportType) {
    let html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
    html += '<style>body { font-family: Arial, sans-serif; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ddd; padding: 8px; text-align: left; } th { background-color: #f2f2f2; }</style>';
    html += '</head><body>';
    
    const now = new Date();
    
    switch(reportType) {
        case 'free-places':
            html += '<h1>ОТЧЕТ О СВОБОДНЫХ МЕСТАХ В ОБЩЕЖИТИЯХ</h1>';
            html += `<p>Дата формирования: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</p>`;
            html += '<table><thead><tr><th>Общежитие</th><th>Тип</th><th>Всего мест</th><th>Занято</th><th>Свободно</th></tr></thead><tbody>';
            
            rows.forEach(row => {
                const type = row.type === 'family' ? 'Семейное' : 'Несемейное';
                html += `<tr><td>${row.name}</td><td>${type}</td><td>${row.total_places}</td><td>${row.occupied_places}</td><td>${row.free_places}</td></tr>`;
            });
            
            const totalFree = rows.reduce((sum, row) => sum + row.free_places, 0);
            const totalOccupied = rows.reduce((sum, row) => sum + row.occupied_places, 0);
            const totalPlaces = rows.reduce((sum, row) => sum + row.total_places, 0);
            
            html += '</tbody></table>';
            html += `<h3>ИТОГО: Всего мест: ${totalPlaces}, Занято: ${totalOccupied}, Свободно: ${totalFree}</h3>`;
            break;
            
        case 'queue':
            html += '<h1>ОТЧЕТ ОБ ОЧЕРЕДИ НА ЗАСЕЛЕНИЕ</h1>';
            html += `<p>Дата формирования: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</p>`;
            html += '<table><thead><tr><th>Позиция</th><th>ФИО</th><th>Доход на члена семьи</th><th>Средний балл</th><th>Общественная нагрузка</th><th>Дата заявки</th></tr></thead><tbody>';
            
            rows.forEach(row => {
                const social = row.social_activity ? 'Да' : 'Нет';
                const date = new Date(row.application_date).toLocaleDateString();
                html += `<tr><td>${row.queue_position}</td><td>${row.full_name}</td><td>${row.income_per_member.toFixed(2)}</td><td>${row.average_grade}</td><td>${social}</td><td>${date}</td></tr>`;
            });
            
            html += '</tbody></table>';
            html += `<h3>ИТОГО: ${rows.length} студентов в очереди</h3>`;
            break;
            
        case 'accommodated':
            html += '<h1>ОТЧЕТ О ЗАСЕЛЕННЫХ СТУДЕНТАХ</h1>';
            html += `<p>Дата формирования: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</p>`;
            html += '<table><thead><tr><th>ФИО</th><th>Средний балл</th><th>Общественная нагрузка</th><th>Дата заявки</th><th>Общежитие</th><th>Тип общежития</th></tr></thead><tbody>';
            
            rows.forEach(row => {
                const social = row.social_activity ? 'Да' : 'Нет';
                const date = new Date(row.application_date).toLocaleDateString();
                const dormType = row.dormitory_type === 'family' ? 'Семейное' : 'Несемейное';
                html += `<tr><td>${row.full_name}</td><td>${row.average_grade}</td><td>${social}</td><td>${date}</td><td>${row.dormitory_name || 'Нет'}</td><td>${dormType}</td></tr>`;
            });
            
            html += '</tbody></table>';
            html += `<h3>ИТОГО: ${rows.length} студентов заселено</h3>`;
            break;
    }
    
    html += '</body></html>';
    return html;
}

// Генерация всех отчетов в TXT
function generateAllReportsTxt(results) {
    let report = 'СВОДНЫЙ ОТЧЕТ ПО СИСТЕМЕ РАСПРЕДЕЛЕНИЯ СТУДЕНТОВ\n';
    report += '====================================================\n\n';
    const now = new Date();
    report += `Дата формирования: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}\n\n`;
    
    // Отчет о свободных местах
    if (results['free-places']) {
        report += '1. ОТЧЕТ О СВОБОДНЫХ МЕСТАХ В ОБЩЕЖИТИЯХ\n';
        report += '========================================\n';
        results['free-places'].forEach(row => {
            const type = row.type === 'family' ? 'Семейное' : 'Несемейное';
            report += `${row.name} (${type}): Всего мест: ${row.total_places}, Занято: ${row.occupied_places}, Свободно: ${row.free_places}\n`;
        });
        
        const totalFree = results['free-places'].reduce((sum, row) => sum + row.free_places, 0);
        const totalOccupied = results['free-places'].reduce((sum, row) => sum + row.occupied_places, 0);
        const totalPlaces = results['free-places'].reduce((sum, row) => sum + row.total_places, 0);
        
        report += `ИТОГО: Всего мест: ${totalPlaces}, Занято: ${totalOccupied}, Свободно: ${totalFree}\n\n`;
    }
    
    // Отчет об очереди
    if (results['queue']) {
        report += '2. ОТЧЕТ ОБ ОЧЕРЕДИ НА ЗАСЕЛЕНИЕ\n';
        report += '================================\n';
        results['queue'].forEach(row => {
            const social = row.social_activity ? 'Да' : 'Нет';
            const date = new Date(row.application_date).toLocaleDateString();
            report += `${row.queue_position}. ${row.full_name} - Доход: ${row.income_per_member.toFixed(2)}, Балл: ${row.average_grade}, Общ. нагрузка: ${social}, Дата: ${date}\n`;
        });
        report += `ИТОГО: ${results['queue'].length} студентов в очереди\n\n`;
    }
    
    // Отчет о заселенных студентах
    if (results['accommodated']) {
        report += '3. ОТЧЕТ О ЗАСЕЛЕННЫХ СТУДЕНТАХ\n';
        report += '=============================\n';
        results['accommodated'].forEach(row => {
            const social = row.social_activity ? 'Да' : 'Нет';
            const date = new Date(row.application_date).toLocaleDateString();
            const dormType = row.dormitory_type === 'family' ? 'Семейное' : 'Несемейное';
            report += `${row.full_name} - Балл: ${row.average_grade}, Общ. нагрузка: ${social}, Дата: ${date}, Общежитие: ${row.dormitory_name || 'Нет'} (${dormType})\n`;
        });
        report += `ИТОГО: ${results['accommodated'].length} студентов заселено\n\n`;
    }
    
    report += '====================================================\n';
    report += 'Конец отчета\n';
    
    return report;
}

// Генерация всех отчетов в DOCX
function generateAllReportsDocx(results) {
    let html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
    html += '<style>body { font-family: Arial, sans-serif; } h1 { color: #2c3e50; } h2 { color: #3498db; margin-top: 30px; } table { border-collapse: collapse; width: 100%; margin-bottom: 20px; } th, td { border: 1px solid #ddd; padding: 8px; text-align: left; } th { background-color: #f2f2f2; } .summary { background-color: #f8f9fa; padding: 10px; border-left: 4px solid #3498db; margin: 20px 0; }</style>';
    html += '</head><body>';
    
    const now = new Date();
    html += `<h1>СВОДНЫЙ ОТЧЕТ ПО СИСТЕМЕ РАСПРЕДЕЛЕНИЯ СТУДЕНТОВ</h1>`;
    html += `<p>Дата формирования: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</p>`;
    
    // Отчет о свободных местах
    if (results['free-places']) {
        html += '<h2>1. Отчет о свободных местах в общежитиях</h2>';
        html += '<table><thead><tr><th>Общежитие</th><th>Тип</th><th>Всего мест</th><th>Занято</th><th>Свободно</th></tr></thead><tbody>';
        
        results['free-places'].forEach(row => {
            const type = row.type === 'family' ? 'Семейное' : 'Несемейное';
            html += `<tr><td>${row.name}</td><td>${type}</td><td>${row.total_places}</td><td>${row.occupied_places}</td><td>${row.free_places}</td></tr>`;
        });
        
        const totalFree = results['free-places'].reduce((sum, row) => sum + row.free_places, 0);
        const totalOccupied = results['free-places'].reduce((sum, row) => sum + row.occupied_places, 0);
        const totalPlaces = results['free-places'].reduce((sum, row) => sum + row.total_places, 0);
        
        html += '</tbody></table>';
        html += `<div class="summary"><strong>ИТОГО:</strong> Всего мест: ${totalPlaces}, Занято: ${totalOccupied}, Свободно: ${totalFree}</div>`;
    }
    
    // Отчет об очереди
    if (results['queue']) {
        html += '<h2>2. Отчет об очереди на заселение</h2>';
        html += '<table><thead><tr><th>Позиция</th><th>ФИО</th><th>Доход на члена семьи</th><th>Средний балл</th><th>Общественная нагрузка</th><th>Дата заявки</th></tr></thead><tbody>';
        
        results['queue'].forEach(row => {
            const social = row.social_activity ? 'Да' : 'Нет';
            const date = new Date(row.application_date).toLocaleDateString();
            html += `<tr><td>${row.queue_position}</td><td>${row.full_name}</td><td>${row.income_per_member.toFixed(2)}</td><td>${row.average_grade}</td><td>${social}</td><td>${date}</td></tr>`;
        });
        
        html += '</tbody></table>';
        html += `<div class="summary"><strong>ИТОГО:</strong> ${results['queue'].length} студентов в очереди</div>`;
    }
    
    // Отчет о заселенных студентах
    if (results['accommodated']) {
        html += '<h2>3. Отчет о заселенных студентах</h2>';
        html += '<table><thead><tr><th>ФИО</th><th>Средний балл</th><th>Общественная нагрузка</th><th>Дата заявки</th><th>Общежитие</th><th>Тип общежития</th></tr></thead><tbody>';
        
        results['accommodated'].forEach(row => {
            const social = row.social_activity ? 'Да' : 'Нет';
            const date = new Date(row.application_date).toLocaleDateString();
            const dormType = row.dormitory_type === 'family' ? 'Семейное' : 'Несемейное';
            html += `<tr><td>${row.full_name}</td><td>${row.average_grade}</td><td>${social}</td><td>${date}</td><td>${row.dormitory_name || 'Нет'}</td><td>${dormType}</td></tr>`;
        });
        
        html += '</tbody></table>';
        html += `<div class="summary"><strong>ИТОГО:</strong> ${results['accommodated'].length} студентов заселено</div>`;
    }
    
    html += '<hr>';
    html += `<p style="text-align: center; color: #7f8c8d; font-size: 0.9em;">Отчет сгенерирован автоматически системой распределения студентов</p>`;
    html += '</body></html>';
    return html;
}

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