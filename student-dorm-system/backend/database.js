const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'student_dorm.db');
const db = new sqlite3.Database(dbPath);

// Initialize database
db.serialize(() => {
    // Students table (both settled and in queue)
    db.run(`CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fullName TEXT NOT NULL,
        avgIncome REAL NOT NULL,
        avgGrade REAL NOT NULL,
        socialActivity REAL NOT NULL,
        dormType TEXT NOT NULL CHECK(dormType IN ('семейное', 'несемейное')),
        totalScore REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'queue' CHECK(status IN ('queue', 'settled')),
        settledAt DATETIME DEFAULT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Dormitory capacity settings
    db.run(`CREATE TABLE IF NOT EXISTS dorm_capacity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dormType TEXT NOT NULL UNIQUE,
        capacity INTEGER NOT NULL
    )`);

    // Initialize capacity if not exists
    db.run(`INSERT OR IGNORE INTO dorm_capacity (dormType, capacity) VALUES 
        ('семейное', 100),
        ('несемейное', 150)
    `);

    // Insert sample data if empty
    db.get("SELECT COUNT(*) as count FROM students", (err, row) => {
        if (row.count === 0) {
            const sampleStudents = [
                ['Иванов Иван Иванович', 2.5, 4.5, 8.0, 'семейное', 0, 'settled'],
                ['Петров Петр Петрович', 3.0, 4.2, 7.5, 'несемейное', 0, 'settled'],
                ['Сидорова Анна Сергеевна', 1.8, 4.8, 9.0, 'семейное', 0, 'queue'],
                ['Козлова Мария Дмитриевна', 2.2, 4.6, 8.5, 'несемейное', 0, 'queue'],
                ['Николаев Алексей Владимирович', 3.5, 4.0, 6.5, 'несемейное', 0, 'queue']
            ];

            sampleStudents.forEach(student => {
                const totalScore = calculateTotalScore(student[1], student[2], student[3]);
                student[5] = totalScore;
                
                db.run(`INSERT INTO students (fullName, avgIncome, avgGrade, socialActivity, dormType, totalScore, status) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)`, student);
            });
        }
    });
});

// Function to calculate total score based on the formula
function calculateTotalScore(avgIncome, avgGrade, socialActivity) {
    // Формула: чем ниже доход и выше успеваемость/активность - тем выше приоритет
    const incomeScore = (10 - avgIncome) * 0.4; // 40% вес
    const gradeScore = avgGrade * 0.4; // 40% вес
    const activityScore = socialActivity * 0.2; // 20% вес
    
    return incomeScore + gradeScore + activityScore;
}

module.exports = { db, calculateTotalScore };