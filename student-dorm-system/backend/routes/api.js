const express = require('express');
const router = express.Router();
const { db, calculateTotalScore } = require('../database.js');

// Get statistics
router.get('/statistics', (req, res) => {
    const queries = [
        "SELECT COUNT(*) as totalSettled FROM students WHERE status = 'settled'",
        "SELECT COUNT(*) as totalQueue FROM students WHERE status = 'queue'",
        "SELECT capacity as familyCapacity FROM dorm_capacity WHERE dormType = 'семейное'",
        "SELECT capacity as nonfamilyCapacity FROM dorm_capacity WHERE dormType = 'несемейное'",
        "SELECT COUNT(*) as familySettled FROM students WHERE status = 'settled' AND dormType = 'семейное'",
        "SELECT COUNT(*) as nonfamilySettled FROM students WHERE status = 'settled' AND dormType = 'несемейное'"
    ];

    db.serialize(() => {
        const results = {};
        
        const executeQuery = (index) => {
            if (index >= queries.length) {
                // Calculate free places
                results.freePlaces = 
                    (results.familyCapacity - results.familySettled) + 
                    (results.nonfamilyCapacity - results.nonfamilySettled);
                res.json(results);
                return;
            }

            db.get(queries[index], (err, row) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }

                const key = Object.keys(row)[0];
                results[key] = row[key];
                executeQuery(index + 1);
            });
        };

        executeQuery(0);
    });
});

// Get dashboard data
router.get('/dashboard', (req, res) => {
    const topFamilyQuery = `
        SELECT * FROM students 
        WHERE status = 'queue' AND dormType = 'семейное' 
        ORDER BY totalScore DESC 
        LIMIT 5
    `;
    
    const topNonfamilyQuery = `
        SELECT * FROM students 
        WHERE status = 'queue' AND dormType = 'несемейное' 
        ORDER BY totalScore DESC 
        LIMIT 5
    `;

    db.serialize(() => {
        db.all(topFamilyQuery, (err, familyCandidates) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }

            db.all(topNonfamilyQuery, (err, nonfamilyCandidates) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }

                res.json({
                    topFamilyCandidates: familyCandidates,
                    topNonfamilyCandidates: nonfamilyCandidates
                });
            });
        });
    });
});

// Get settled students
router.get('/students/settled', (req, res) => {
    const query = "SELECT * FROM students WHERE status = 'settled' ORDER BY fullName";
    
    db.all(query, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get queue students
router.get('/students/queue', (req, res) => {
    const query = "SELECT * FROM students WHERE status = 'queue' ORDER BY totalScore DESC";
    
    db.all(query, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get next students for settlement
router.get('/students/next-for-settlement', (req, res) => {
    const queries = [
        `SELECT s.* FROM students s 
         WHERE s.status = 'queue' AND s.dormType = 'семейное'
         ORDER BY s.totalScore DESC 
         LIMIT 1`,
        `SELECT s.* FROM students s 
         WHERE s.status = 'queue' AND s.dormType = 'несемейное'
         ORDER BY s.totalScore DESC 
         LIMIT 1`
    ];

    db.serialize(() => {
        const candidates = [];
        
        const executeQuery = (index) => {
            if (index >= queries.length) {
                res.json(candidates.filter(candidate => candidate !== null));
                return;
            }

            db.get(queries[index], (err, row) => {
                if (!err && row) {
                    candidates.push(row);
                }
                executeQuery(index + 1);
            });
        };

        executeQuery(0);
    });
});

// Get single student
router.get('/students/:id', (req, res) => {
    const query = "SELECT * FROM students WHERE id = ?";
    
    db.get(query, [req.params.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (!row) {
            res.status(404).json({ error: 'Student not found' });
            return;
        }
        res.json(row);
    });
});

// Settle student
router.post('/students/:id/settle', (req, res) => {
    const checkCapacityQuery = `
        SELECT COUNT(*) as settledCount, dc.capacity 
        FROM students s 
        JOIN dorm_capacity dc ON s.dormType = dc.dormType 
        WHERE s.id = ? AND s.status = 'settled'
    `;

    db.get(checkCapacityQuery, [req.params.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        // Check if there's capacity
        const checkAvailableQuery = `
            SELECT dc.capacity, COUNT(*) as currentCount 
            FROM dorm_capacity dc 
            LEFT JOIN students s ON dc.dormType = s.dormType AND s.status = 'settled' 
            WHERE dc.dormType = (
                SELECT dormType FROM students WHERE id = ?
            )
            GROUP BY dc.dormType
        `;

        db.get(checkAvailableQuery, [req.params.id], (err, capacityRow) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }

            if (capacityRow.currentCount >= capacityRow.capacity) {
                res.status(400).json({ error: 'No available places in this dormitory type' });
                return;
            }

            // Settle the student
            const updateQuery = "UPDATE students SET status = 'settled', settledAt = CURRENT_TIMESTAMP WHERE id = ?";
            
            db.run(updateQuery, [req.params.id], function(err) {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json({ message: 'Student settled successfully' });
            });
        });
    });
});

// Evict student
router.post('/students/:id/evict', (req, res) => {
    const query = "UPDATE students SET status = 'queue', settledAt = NULL WHERE id = ?";
    
    db.run(query, [req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'Student evicted successfully' });
    });
});

// Register new application
router.post('/applications', (req, res) => {
    const { fullName, avgIncome, avgGrade, socialActivity, dormType } = req.body;
    
    if (!fullName || avgIncome === undefined || avgGrade === undefined || socialActivity === undefined || !dormType) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const totalScore = calculateTotalScore(avgIncome, avgGrade, socialActivity);
    
    const query = `
        INSERT INTO students (fullName, avgIncome, avgGrade, socialActivity, dormType, totalScore, status) 
        VALUES (?, ?, ?, ?, ?, ?, 'queue')
    `;
    
    db.run(query, [fullName, avgIncome, avgGrade, socialActivity, dormType, totalScore], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ 
            message: 'Application registered successfully', 
            id: this.lastID 
        });
    });
});

// Free places report
router.get('/reports/free-places', (req, res) => {
    const query = `
        SELECT 
            dc.dormType,
            dc.capacity,
            COUNT(CASE WHEN s.status = 'settled' THEN 1 END) as settled,
            dc.capacity - COUNT(CASE WHEN s.status = 'settled' THEN 1 END) as free
        FROM dorm_capacity dc
        LEFT JOIN students s ON dc.dormType = s.dormType
        GROUP BY dc.dormType, dc.capacity
    `;

    db.all(query, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        const result = {
            familyCapacity: 0,
            familyFree: 0,
            nonfamilyCapacity: 0,
            nonfamilyFree: 0,
            totalFree: 0
        };

        rows.forEach(row => {
            if (row.dormType === 'семейное') {
                result.familyCapacity = row.capacity;
                result.familyFree = row.free;
            } else if (row.dormType === 'несемейное') {
                result.nonfamilyCapacity = row.capacity;
                result.nonfamilyFree = row.free;
            }
        });

        result.totalFree = result.familyFree + result.nonfamilyFree;
        res.json(result);
    });
});

// Queue report
router.get('/reports/queue', (req, res) => {
    const queries = {
        familyQueue: "SELECT COUNT(*) as count FROM students WHERE status = 'queue' AND dormType = 'семейное'",
        nonfamilyQueue: "SELECT COUNT(*) as count FROM students WHERE status = 'queue' AND dormType = 'несемейное'",
        topFamily: "SELECT * FROM students WHERE status = 'queue' AND dormType = 'семейное' ORDER BY totalScore DESC LIMIT 5",
        topNonfamily: "SELECT * FROM students WHERE status = 'queue' AND dormType = 'несемейное' ORDER BY totalScore DESC LIMIT 5"
    };

    db.serialize(() => {
        const result = {};

        const executeQuery = (key, query) => {
            return new Promise((resolve, reject) => {
                if (query.includes('COUNT')) {
                    db.get(query, (err, row) => {
                        if (err) reject(err);
                        else {
                            result[key] = row.count;
                            resolve();
                        }
                    });
                } else {
                    db.all(query, (err, rows) => {
                        if (err) reject(err);
                        else {
                            result[key] = rows;
                            resolve();
                        }
                    });
                }
            });
        };

        Promise.all([
            executeQuery('familyQueue', queries.familyQueue),
            executeQuery('nonfamilyQueue', queries.nonfamilyQueue),
            executeQuery('topFamilyCandidates', queries.topFamily),
            executeQuery('topNonfamilyCandidates', queries.topNonfamily)
        ]).then(() => {
            res.json(result);
        }).catch(err => {
            res.status(500).json({ error: err.message });
        });
    });
});

module.exports = router;