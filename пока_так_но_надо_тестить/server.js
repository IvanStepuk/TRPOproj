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

// Функция для проверки авторизации администратора
function checkAdminAuth(req, res, next) {
    const sessionId = req.headers['x-session-id'] || req.query.sessionId;
    
    if (!sessionId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    const session = sessions[sessionId];
    if (!session) {
        return res.status(401).json({ error: 'Сессия недействительна или истекла' });
    }
    
    if (session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }
    
    req.session = session;
    req.user = session.user;
    next();
}

// Функция для расчета приоритета студента
function calculatePriority(student) {
    let priorityScore = 0;
    
    // 1. Средний балл
    priorityScore += student.average_grade * 100;
    
    // 2. Общественная нагрузка
    if (student.social_activity) {
        priorityScore += 50;
    }
    
    // 3. Доход на члена семьи
    const incomePerMember = student.family_income / student.family_members;
    if (incomePerMember <= 100) priorityScore += 40;
    else if (incomePerMember <= 300) priorityScore += 30;
    else if (incomePerMember <= 500) priorityScore += 20;
    else if (incomePerMember <= 1000) priorityScore += 10;
    
    // 4. Дата заявки
    const applicationDate = new Date(student.application_date);
    const daysDiff = Math.floor((new Date() - applicationDate) / (1000 * 60 * 60 * 24));
    priorityScore += Math.max(0, 30 - daysDiff);
    
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
        
        const sessionId = Math.random().toString(36).substring(2) + 
                         Math.random().toString(36).substring(2);
        sessions[sessionId] = { 
            user,
            createdAt: new Date(),
            lastActivity: new Date()
        };
        
        // Очищаем старые сессии (старше 24 часов)
        const now = new Date();
        Object.keys(sessions).forEach(key => {
            if (now - sessions[key].createdAt > 24 * 60 * 60 * 1000) {
                delete sessions[key];
            }
        });
        
        res.json({ 
            success: true, 
            sessionId,
            user: { 
                username: user.username, 
                role: user.role 
            }
        });
    });
});

// Выход из системы
app.post('/api/logout', checkAdminAuth, (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (sessionId && sessions[sessionId]) {
        delete sessions[sessionId];
    }
    res.json({ success: true, message: 'Вы вышли из системы' });
});

// Проверка сессии
app.get('/api/check-session', (req, res) => {
    const sessionId = req.headers['x-session-id'] || req.query.sessionId;
    
    if (!sessionId || !sessions[sessionId]) {
        return res.json({ valid: false });
    }
    
    // Обновляем время последней активности
    sessions[sessionId].lastActivity = new Date();
    
    res.json({ 
        valid: true, 
        user: sessions[sessionId].user 
    });
});

// Получение списка студентов (публичный доступ) - ИСПРАВЛЕННЫЙ
app.get('/api/students', (req, res) => {
    const { search, status } = req.query;
    
    let baseQuery = `
        SELECT s.*, 
               d.name as dormitory_name,
               (s.family_income / s.family_members) as income_per_member
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
        baseQuery += ' WHERE ' + conditions.join(' AND ');
    }
    
    db.all(baseQuery, params, (err, students) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Рассчитываем позиции для студентов в очереди
        const waitingStudents = students.filter(s => s.status === 'waiting');
        
        waitingStudents.forEach(student => {
            const studentPriority = calculatePriority(student);
            
            let higherPriorityCount = 0;
            waitingStudents.forEach(s => {
                if (s.id === student.id) return;
                
                const sPriority = calculatePriority(s);
                if (sPriority > studentPriority) {
                    higherPriorityCount++;
                } else if (sPriority === studentPriority) {
                    const sDate = new Date(s.application_date);
                    const studentDate = new Date(student.application_date);
                    if (sDate < studentDate) {
                        higherPriorityCount++;
                    }
                }
            });
            
            student.queue_position = higherPriorityCount + 1;
        });
        
        // Обновляем позиции в основном массиве
        students.forEach(student => {
            if (student.status === 'waiting') {
                const waitingStudent = waitingStudents.find(s => s.id === student.id);
                if (waitingStudent) {
                    student.queue_position = waitingStudent.queue_position;
                }
            }
        });
        
        // Сортируем: сначала заселенные, затем в очереди по позиции
        students.sort((a, b) => {
            if (a.status === 'accommodated' && b.status === 'waiting') return -1;
            if (a.status === 'waiting' && b.status === 'accommodated') return 1;
            if (a.status === 'waiting' && b.status === 'waiting') {
                return (a.queue_position || 999) - (b.queue_position || 999);
            }
            return 0;
        });
        
        res.json(students);
    });
});

// Получение списка общежитий (доступно всем)
app.get('/api/dormitories', (req, res) => {
    db.all("SELECT * FROM dormitories", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// ===== ЗАЩИЩЕННЫЕ ЭНДПОИНТЫ (только для администраторов) =====

// Получение отчета о свободных местах
app.get('/api/reports/free-places', checkAdminAuth, (req, res) => {
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

// Получение отчета об очереди - ИСПРАВЛЕННЫЙ
app.get('/api/reports/queue', checkAdminAuth, (req, res) => {
    db.all(`
        SELECT 
            s.*,
            (s.family_income / s.family_members) as income_per_member
        FROM students s
        WHERE s.status = 'waiting'
    `, (err, students) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Рассчитываем позиции для каждого студента
        students.forEach(student => {
            const studentPriority = calculatePriority(student);
            
            let higherPriorityCount = 0;
            students.forEach(s => {
                if (s.id === student.id) return;
                
                const sPriority = calculatePriority(s);
                if (sPriority > studentPriority) {
                    higherPriorityCount++;
                } else if (sPriority === studentPriority) {
                    const sDate = new Date(s.application_date);
                    const studentDate = new Date(student.application_date);
                    if (sDate < studentDate) {
                        higherPriorityCount++;
                    }
                }
            });
            
            student.queue_position = higherPriorityCount + 1;
            student.priority_score = studentPriority;
        });
        
        // Сортируем по позиции в очереди
        students.sort((a, b) => a.queue_position - b.queue_position);
        
        res.json(students);
    });
});

// Получение отчета о заселенных студентах
app.get('/api/reports/accommodated', checkAdminAuth, (req, res) => {
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

// Экспорт отчета в разных форматах
app.get('/api/export/:reportType/:format', checkAdminAuth, (req, res) => {
    const { reportType, format } = req.params;
    let query = '';
    
    if (format !== 'txt' && format !== 'html') {
        return res.status(400).json({ error: 'Неподдерживаемый формат. Используйте txt или html' });
    }
    
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
                    s.*,
                    (s.family_income / s.family_members) as income_per_member
                FROM students s
                WHERE s.status = 'waiting'
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
            exportAllReports(res, format);
            return;
            
        default:
            return res.status(400).json({ error: 'Неверный тип отчета' });
    }
    
    db.all(query, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (reportType === 'queue') {
            rows.forEach(student => {
                const studentPriority = calculatePriority(student);
                
                let higherPriorityCount = 0;
                rows.forEach(s => {
                    if (s.id === student.id) return;
                    
                    const sPriority = calculatePriority(s);
                    if (sPriority > studentPriority) {
                        higherPriorityCount++;
                    } else if (sPriority === studentPriority) {
                        const sDate = new Date(s.application_date);
                        const studentDate = new Date(student.application_date);
                        if (sDate < studentDate) {
                            higherPriorityCount++;
                        }
                    }
                });
                
                student.queue_position = higherPriorityCount + 1;
            });
            
            rows.sort((a, b) => a.queue_position - b.queue_position);
        }
        
        const fileName = `report_${reportType}_${new Date().toISOString().slice(0,10)}.${format}`;
        
        if (format === 'txt') {
            const reportText = generateTxtReport(rows, reportType);
            
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(reportText);
        } else if (format === 'html') {
            const reportHtml = generateHtmlReport(rows, reportType);
            
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(reportHtml);
        }
    });
});

// Функция для экспорта всех отчетов
function exportAllReports(res, format) {
    const queries = {
        'free-places': `SELECT d.name, d.type, d.total_places, d.occupied_places, (d.total_places - d.occupied_places) as free_places FROM dormitories d ORDER BY d.name`,
        'queue': `SELECT s.*, (s.family_income / s.family_members) as income_per_member FROM students s WHERE s.status = 'waiting'`,
        'accommodated': `SELECT s.full_name, s.average_grade, s.social_activity, s.application_date, d.name as dormitory_name, d.type as dormitory_type FROM students s LEFT JOIN dormitories d ON s.dormitory_id = d.id WHERE s.status = 'accommodated' ORDER BY s.full_name`
    };
    
    const results = {};
    let completed = 0;
    
    Object.keys(queries).forEach(reportType => {
        db.all(queries[reportType], (err, rows) => {
            if (err) {
                console.error(`Error fetching ${reportType}:`, err);
            } else {
                if (reportType === 'queue') {
                    rows.forEach(student => {
                        const studentPriority = calculatePriority(student);
                        
                        let higherPriorityCount = 0;
                        rows.forEach(s => {
                            if (s.id === student.id) return;
                            
                            const sPriority = calculatePriority(s);
                            if (sPriority > studentPriority) {
                                higherPriorityCount++;
                            } else if (sPriority === studentPriority) {
                                const sDate = new Date(s.application_date);
                                const studentDate = new Date(student.application_date);
                                if (sDate < studentDate) {
                                    higherPriorityCount++;
                                }
                            }
                        });
                        
                        student.queue_position = higherPriorityCount + 1;
                    });
                    
                    rows.sort((a, b) => a.queue_position - b.queue_position);
                }
                
                results[reportType] = rows;
            }
            
            completed++;
            
            if (completed === Object.keys(queries).length) {
                const fileName = `all_reports_${new Date().toISOString().slice(0,10)}.${format}`;
                
                if (format === 'txt') {
                    const reportText = generateAllReportsTxt(results);
                    
                    res.setHeader('Content-Type', 'text/plain');
                    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                    res.send(reportText);
                } else if (format === 'html') {
                    const reportHtml = generateAllReportsHtml(results);
                    
                    res.setHeader('Content-Type', 'text/html');
                    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                    res.send(reportHtml);
                }
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

// Генерация HTML отчета (простой стиль как в TXT, готовый к печати)
function generateHtmlReport(rows, reportType) {
    const now = new Date();
    let title = '';
    let headers = '';
    let tableRows = '';
    let summary = '';
    
    switch(reportType) {
        case 'free-places':
            title = 'ОТЧЕТ О СВОБОДНЫХ МЕСТАХ В ОБЩЕЖИТИЯХ';
            headers = `
                <tr>
                    <th>Общежитие</th>
                    <th>Тип</th>
                    <th>Всего мест</th>
                    <th>Занято</th>
                    <th>Свободно</th>
                </tr>
            `;
            
            rows.forEach(row => {
                const type = row.type === 'family' ? 'Семейное' : 'Несемейное';
                tableRows += `
                    <tr>
                        <td>${row.name}</td>
                        <td>${type}</td>
                        <td>${row.total_places}</td>
                        <td>${row.occupied_places}</td>
                        <td>${row.free_places}</td>
                    </tr>
                `;
            });
            
            const totalFree = rows.reduce((sum, row) => sum + row.free_places, 0);
            const totalOccupied = rows.reduce((sum, row) => sum + row.occupied_places, 0);
            const totalPlaces = rows.reduce((sum, row) => sum + row.total_places, 0);
            
            summary = `
                <div class="summary">
                    <p><strong>ИТОГО:</strong> Всего мест: ${totalPlaces}, Занято: ${totalOccupied}, Свободно: ${totalFree}</p>
                </div>
            `;
            break;
            
        case 'queue':
            title = 'ОТЧЕТ ОБ ОЧЕРЕДИ НА ЗАСЕЛЕНИЕ';
            headers = `
                <tr>
                    <th>Позиция</th>
                    <th>ФИО</th>
                    <th>Доход на члена семьи</th>
                    <th>Средний балл</th>
                    <th>Общественная нагрузка</th>
                    <th>Дата заявки</th>
                </tr>
            `;
            
            rows.forEach(row => {
                const social = row.social_activity ? 'Да' : 'Нет';
                const date = new Date(row.application_date).toLocaleDateString();
                tableRows += `
                    <tr>
                        <td>${row.queue_position}</td>
                        <td>${row.full_name}</td>
                        <td>${row.income_per_member.toFixed(2)}</td>
                        <td>${row.average_grade}</td>
                        <td>${social}</td>
                        <td>${date}</td>
                    </tr>
                `;
            });
            
            summary = `<div class="summary"><p><strong>ИТОГО:</strong> ${rows.length} студентов в очереди</p></div>`;
            break;
            
        case 'accommodated':
            title = 'ОТЧЕТ О ЗАСЕЛЕННЫХ СТУДЕНТАХ';
            headers = `
                <tr>
                    <th>ФИО</th>
                    <th>Средний балл</th>
                    <th>Общественная нагрузка</th>
                    <th>Дата заявки</th>
                    <th>Общежитие</th>
                    <th>Тип общежития</th>
                </tr>
            `;
            
            rows.forEach(row => {
                const social = row.social_activity ? 'Да' : 'Нет';
                const date = new Date(row.application_date).toLocaleDateString();
                const dormType = row.dormitory_type === 'family' ? 'Семейное' : 'Несемейное';
                tableRows += `
                    <tr>
                        <td>${row.full_name}</td>
                        <td>${row.average_grade}</td>
                        <td>${social}</td>
                        <td>${date}</td>
                        <td>${row.dormitory_name || 'Нет'}</td>
                        <td>${dormType}</td>
                    </tr>
                `;
            });
            
            summary = `<div class="summary"><p><strong>ИТОГО:</strong> ${rows.length} студентов заселено</p></div>`;
            break;
    }
    
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        /* Стили для печати */
        @media print {
            body {
                margin: 0;
                padding: 0;
                font-size: 12pt;
            }
            
            .no-print {
                display: none !important;
            }
            
            table {
                page-break-inside: auto;
            }
            
            tr {
                page-break-inside: avoid;
                page-break-after: auto;
            }
            
            thead {
                display: table-header-group;
            }
            
            tfoot {
                display: table-footer-group;
            }
            
            .print-btn {
                display: none !important;
            }
        }
        
        /* Общие стили */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Courier New', monospace;
            line-height: 1.4;
            color: #000;
            background-color: #fff;
            margin: 20px;
            font-size: 14px;
        }
        
        .report-header {
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #000;
        }
        
        .report-title {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 5px;
            text-transform: uppercase;
        }
        
        .report-date {
            font-size: 12px;
            color: #666;
            margin-bottom: 10px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            border: 1px solid #000;
        }
        
        th {
            background-color: #f0f0f0;
            border: 1px solid #000;
            padding: 8px 5px;
            text-align: left;
            font-weight: bold;
            font-size: 12px;
        }
        
        td {
            border: 1px solid #000;
            padding: 6px 5px;
            font-size: 12px;
            vertical-align: top;
        }
        
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        
        .summary {
            margin-top: 20px;
            padding: 10px;
            border: 1px solid #000;
            background-color: #f0f0f0;
            font-weight: bold;
        }
        
        .page-break {
            page-break-before: always;
        }
        
        /* Кнопки управления (видны только на экране) */
        .print-controls {
            position: fixed;
            top: 10px;
            right: 10px;
            background-color: #fff;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 1000;
        }
        
        .print-btn {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
            margin-right: 5px;
        }
        
        .print-btn:hover {
            background-color: #0056b3;
        }
        
        .back-btn {
            background-color: #6c757d;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
        }
        
        .back-btn:hover {
            background-color: #545b62;
        }
        
        /* Для сводного отчета */
        .section-title {
            font-size: 16px;
            font-weight: bold;
            margin-top: 30px;
            padding-bottom: 5px;
            border-bottom: 1px solid #000;
            text-transform: uppercase;
        }
        
        .footer {
            margin-top: 30px;
            padding-top: 10px;
            border-top: 1px solid #ccc;
            font-size: 10px;
            color: #666;
            text-align: center;
        }
    </style>
</head>
<body>
    <!-- Панель управления для печати (не печатается) -->
    <div class="print-controls no-print">
        <button class="print-btn" onclick="window.print()">🖨️ Печать</button>
        <button class="back-btn" onclick="window.close()">✖️ Закрыть</button>
    </div>
    
    <div class="report-header">
        <div class="report-title">${title}</div>
        <div class="report-date">Дата формирования: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</div>
    </div>
    
    <table>
        <thead>
            ${headers}
        </thead>
        <tbody>
            ${tableRows}
        </tbody>
    </table>
    
    ${summary}
    
    <div class="footer">
        <p>Сгенерировано системой распределения студентов</p>
        <p>Файл: ${reportType}.html | Дата: ${now.toLocaleDateString()}</p>
    </div>
    
    <script>
        // Автоматически предлагаем печать при открытии
        window.onload = function() {
            // Можно раскомментировать, чтобы автоматически открывать диалог печати
            // setTimeout(function() { window.print(); }, 1000);
        };
        
        // Добавляем обработчик клавиши Ctrl+P
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
                window.print();
            }
        });
    </script>
</body>
</html>
    `;
}

// Генерация всех отчетов в TXT
function generateAllReportsTxt(results) {
    let report = 'СВОДНЫЙ ОТЧЕТ ПО СИСТЕМЕ РАСПРЕДЕЛЕНИЯ СТУДЕНТОВ\n';
    report += '====================================================\n\n';
    const now = new Date();
    report += `Дата формирования: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}\n\n`;
    
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

// Генерация всех отчетов в HTML
function generateAllReportsHtml(results) {
    const now = new Date();
    
    let freePlacesRows = '';
    let queueRows = '';
    let accommodatedRows = '';
    
    let freePlacesSummary = '';
    let queueSummary = '';
    let accommodatedSummary = '';
    
    // Генерация строк для свободных мест
    if (results['free-places']) {
        results['free-places'].forEach(row => {
            const type = row.type === 'family' ? 'Семейное' : 'Несемейное';
            freePlacesRows += `
                <tr>
                    <td>${row.name}</td>
                    <td>${type}</td>
                    <td>${row.total_places}</td>
                    <td>${row.occupied_places}</td>
                    <td>${row.free_places}</td>
                </tr>
            `;
        });
        
        const totalFree = results['free-places'].reduce((sum, row) => sum + row.free_places, 0);
        const totalOccupied = results['free-places'].reduce((sum, row) => sum + row.occupied_places, 0);
        const totalPlaces = results['free-places'].reduce((sum, row) => sum + row.total_places, 0);
        
        freePlacesSummary = `
            <p><strong>ИТОГО:</strong> Всего мест: ${totalPlaces}, Занято: ${totalOccupied}, Свободно: ${totalFree}</p>
        `;
    }
    
    // Генерация строк для очереди
    if (results['queue']) {
        results['queue'].forEach(row => {
            const social = row.social_activity ? 'Да' : 'Нет';
            const date = new Date(row.application_date).toLocaleDateString();
            queueRows += `
                <tr>
                    <td>${row.queue_position}</td>
                    <td>${row.full_name}</td>
                    <td>${row.income_per_member.toFixed(2)}</td>
                    <td>${row.average_grade}</td>
                    <td>${social}</td>
                    <td>${date}</td>
                </tr>
            `;
        });
        
        queueSummary = `<p><strong>ИТОГО:</strong> ${results['queue'].length} студентов в очереди</p>`;
    }
    
    // Генерация строк для заселенных
    if (results['accommodated']) {
        results['accommodated'].forEach(row => {
            const social = row.social_activity ? 'Да' : 'Нет';
            const date = new Date(row.application_date).toLocaleDateString();
            const dormType = row.dormitory_type === 'family' ? 'Семейное' : 'Несемейное';
            accommodatedRows += `
                <tr>
                    <td>${row.full_name}</td>
                    <td>${row.average_grade}</td>
                    <td>${social}</td>
                    <td>${date}</td>
                    <td>${row.dormitory_name || 'Нет'}</td>
                    <td>${dormType}</td>
                </tr>
            `;
        });
        
        accommodatedSummary = `<p><strong>ИТОГО:</strong> ${results['accommodated'].length} студентов заселено</p>`;
    }
    
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Сводный отчет</title>
    <style>
        /* Стили для печати */
        @media print {
            body {
                margin: 0;
                padding: 0;
                font-size: 12pt;
            }
            
            .no-print {
                display: none !important;
            }
            
            table {
                page-break-inside: auto;
            }
            
            tr {
                page-break-inside: avoid;
                page-break-after: auto;
            }
            
            thead {
                display: table-header-group;
            }
            
            tfoot {
                display: table-footer-group;
            }
            
            .print-btn {
                display: none !important;
            }
            
            .section {
                page-break-inside: avoid;
            }
        }
        
        /* Общие стили */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Courier New', monospace;
            line-height: 1.4;
            color: #000;
            background-color: #fff;
            margin: 20px;
            font-size: 14px;
        }
        
        .report-header {
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #000;
        }
        
        .main-title {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 5px;
            text-transform: uppercase;
        }
        
        .report-date {
            font-size: 12px;
            color: #666;
            margin-bottom: 10px;
        }
        
        .section {
            margin-top: 30px;
            page-break-inside: avoid;
        }
        
        .section-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 15px;
            padding-bottom: 5px;
            border-bottom: 1px solid #000;
            text-transform: uppercase;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            border: 1px solid #000;
        }
        
        th {
            background-color: #f0f0f0;
            border: 1px solid #000;
            padding: 8px 5px;
            text-align: left;
            font-weight: bold;
            font-size: 12px;
        }
        
        td {
            border: 1px solid #000;
            padding: 6px 5px;
            font-size: 12px;
            vertical-align: top;
        }
        
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        
        .summary {
            margin-top: 15px;
            padding: 10px;
            border: 1px solid #000;
            background-color: #f0f0f0;
            font-weight: bold;
        }
        
        .page-break {
            page-break-before: always;
        }
        
        /* Кнопки управления (видны только на экране) */
        .print-controls {
            position: fixed;
            top: 10px;
            right: 10px;
            background-color: #fff;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 1000;
        }
        
        .print-btn {
            background-color: #007bff;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
            margin-right: 5px;
        }
        
        .print-btn:hover {
            background-color: #0056b3;
        }
        
        .back-btn {
            background-color: #6c757d;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
        }
        
        .back-btn:hover {
            background-color: #545b62;
        }
        
        .footer {
            margin-top: 40px;
            padding-top: 10px;
            border-top: 1px solid #ccc;
            font-size: 10px;
            color: #666;
            text-align: center;
        }
    </style>
</head>
<body>
    <!-- Панель управления для печати (не печатается) -->
    <div class="print-controls no-print">
        <button class="print-btn" onclick="window.print()">🖨️ Печать</button>
        <button class="back-btn" onclick="window.close()">✖️ Закрыть</button>
    </div>
    
    <div class="report-header">
        <div class="main-title">СВОДНЫЙ ОТЧЕТ ПО СИСТЕМЕ РАСПРЕДЕЛЕНИЯ СТУДЕНТОВ</div>
        <div class="report-date">Дата формирования: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</div>
    </div>
    
    ${results['free-places'] ? `
    <div class="section">
        <div class="section-title">1. ОТЧЕТ О СВОБОДНЫХ МЕСТАХ В ОБЩЕЖИТИЯХ</div>
        <table>
            <thead>
                <tr>
                    <th>Общежитие</th>
                    <th>Тип</th>
                    <th>Всего мест</th>
                    <th>Занято</th>
                    <th>Свободно</th>
                </tr>
            </thead>
            <tbody>
                ${freePlacesRows}
            </tbody>
        </table>
        <div class="summary">
            ${freePlacesSummary}
        </div>
    </div>
    ` : ''}
    
    ${results['queue'] ? `
    <div class="page-break"></div>
    <div class="section">
        <div class="section-title">2. ОТЧЕТ ОБ ОЧЕРЕДИ НА ЗАСЕЛЕНИЕ</div>
        <table>
            <thead>
                <tr>
                    <th>Позиция</th>
                    <th>ФИО</th>
                    <th>Доход на члена семьи</th>
                    <th>Средний балл</th>
                    <th>Общественная нагрузка</th>
                    <th>Дата заявки</th>
                </tr>
            </thead>
            <tbody>
                ${queueRows}
            </tbody>
        </table>
        <div class="summary">
            ${queueSummary}
        </div>
    </div>
    ` : ''}
    
    ${results['accommodated'] ? `
    <div class="page-break"></div>
    <div class="section">
        <div class="section-title">3. ОТЧЕТ О ЗАСЕЛЕННЫХ СТУДЕНТАХ</div>
        <table>
            <thead>
                <tr>
                    <th>ФИО</th>
                    <th>Средний балл</th>
                    <th>Общественная нагрузка</th>
                    <th>Дата заявки</th>
                    <th>Общежитие</th>
                    <th>Тип общежития</th>
                </tr>
            </thead>
            <tbody>
                ${accommodatedRows}
            </tbody>
        </table>
        <div class="summary">
            ${accommodatedSummary}
        </div>
    </div>
    ` : ''}
    
    <div class="footer">
        <p>Сгенерировано системой распределения студентов</p>
        <p>Полный сводный отчет | Дата: ${now.toLocaleDateString()}</p>
    </div>
    
    <script>
        // Автоматически предлагаем печать при открытии
        window.onload = function() {
            // Можно раскомментировать, чтобы автоматически открывать диалог печати
            // setTimeout(function() { window.print(); }, 1000);
        };
        
        // Добавляем обработчик клавиши Ctrl+P
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
                window.print();
            }
        });
    </script>
</body>
</html>
    `;
}

// Регистрация новой заявки (доступно только админам)
app.post('/api/students', checkAdminAuth, (req, res) => {
    const { full_name, family_income, family_members, average_grade, social_activity } = req.body;
    
    if (!full_name || !family_income || !family_members || !average_grade) {
        return res.status(400).json({ error: 'Все обязательные поля должны быть заполнены' });
    }
    
    if (typeof full_name !== 'string' || full_name.trim().length < 2) {
        return res.status(400).json({ error: 'ФИО должно содержать минимум 2 символа' });
    }
    
    if (full_name.trim().length > 100) {
        return res.status(400).json({ error: 'ФИО слишком длинное (макс. 100 символов)' });
    }
    
    const income = parseFloat(family_income);
    if (isNaN(income) || income < 0) {
        return res.status(400).json({ error: 'Доход семьи должен быть положительным числом' });
    }
    
    if (income > 10000000) {
        return res.status(400).json({ error: 'Доход семьи слишком большой (макс. 10,000,000)' });
    }
    
    const members = parseInt(family_members);
    if (isNaN(members) || members < 1 || members > 20) {
        return res.status(400).json({ error: 'Количество членов семьи должно быть от 1 до 20' });
    }
    
    const grade = parseFloat(average_grade);
    if (isNaN(grade) || grade < 0 || grade > 10) {
        return res.status(400).json({ error: 'Средний балл должен быть от 0 до 10' });
    }
    
    const social = social_activity ? 1 : 0;
    
    const query = `
        INSERT INTO students (full_name, family_income, family_members, average_grade, social_activity)
        VALUES (?, ?, ?, ?, ?)
    `;
    
    db.run(query, [
        full_name.trim(),
        income,
        members,
        grade,
        social
    ], function(err) {
        if (err) {
            console.error('Ошибка при регистрации заявки:', err);
            return res.status(500).json({ error: 'Ошибка при регистрации заявки в базе данных' });
        }
        
        res.json({ 
            success: true, 
            id: this.lastID,
            message: 'Заявка успешно зарегистрирована'
        });
    });
});

// Заселение студента (доступно только админам)
app.post('/api/students/:id/accommodate', checkAdminAuth, (req, res) => {
    const studentId = req.params.id;
    const { dormitory_id } = req.body;
    
    if (!dormitory_id) {
        return res.status(400).json({ error: 'Необходимо указать общежитие' });
    }
    
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
        
        db.serialize(() => {
            db.run("UPDATE students SET status = 'accommodated', dormitory_id = ? WHERE id = ?", 
                   [dormitory_id, studentId]);
            
            db.run("UPDATE dormitories SET occupied_places = occupied_places + 1 WHERE id = ?", [dormitory_id]);
            
            res.json({ success: true, message: 'Студент успешно заселен' });
        });
    });
});

// Выселение студента (доступно только админам)
app.post('/api/students/:id/evict', checkAdminAuth, (req, res) => {
    const studentId = req.params.id;
    
    db.get("SELECT dormitory_id FROM students WHERE id = ?", [studentId], (err, student) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (!student) {
            return res.status(404).json({ error: 'Студент не найден' });
        }
        
        db.serialize(() => {
            if (student.dormitory_id) {
                db.run("UPDATE dormitories SET occupied_places = occupied_places - 1 WHERE id = ?", [student.dormitory_id]);
            }
            
            db.run("UPDATE students SET status = 'waiting', dormitory_id = NULL WHERE id = ?", [studentId]);
            
            res.json({ success: true, message: 'Студент успешно выселен' });
        });
    });
});

// Получение следующего кандидата для заселения - ИСПРАВЛЕННЫЙ (доступно только админам)
app.get('/api/students/next-candidate', checkAdminAuth, (req, res) => {
    db.all(`
        SELECT s.*,
               (s.family_income / s.family_members) as income_per_member
        FROM students s
        WHERE s.status = 'waiting'
    `, (err, waitingStudents) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (waitingStudents.length === 0) {
            return res.json({});
        }
        
        waitingStudents.forEach(student => {
            const studentPriority = calculatePriority(student);
            
            let higherPriorityCount = 0;
            waitingStudents.forEach(s => {
                if (s.id === student.id) return;
                
                const sPriority = calculatePriority(s);
                if (sPriority > studentPriority) {
                    higherPriorityCount++;
                } else if (sPriority === studentPriority) {
                    const sDate = new Date(s.application_date);
                    const studentDate = new Date(student.application_date);
                    if (sDate < studentDate) {
                        higherPriorityCount++;
                    }
                }
            });
            
            student.queue_position = higherPriorityCount + 1;
            student.priority_score = studentPriority;
        });
        
        const nextCandidate = waitingStudents.find(s => s.queue_position === 1);
        
        res.json(nextCandidate || waitingStudents[0] || {});
    });
});

// Статические файлы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Откройте http://localhost:${PORT} в браузере`);
});
