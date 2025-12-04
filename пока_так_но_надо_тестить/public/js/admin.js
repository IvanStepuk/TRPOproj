
let currentSession = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Убираем автоматическую проверку сохраненной сессии
    // Пользователь должен всегда входить через форму авторизации
    showLoginForm();
    
    // Обработчик формы авторизации
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Обработчик формы заявки
    document.getElementById('applicationForm').addEventListener('submit', handleApplication);
    
    // Обработчик формы заселения
    document.getElementById('accommodateForm').addEventListener('submit', handleAccommodation);
    
    // Обработчик выхода
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
});

// Показать форму авторизации
function showLoginForm() {
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
}

// Обработка авторизации
function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    // Проверка на пустые поля
    if (!username || !password) {
        alert('Пожалуйста, введите имя пользователя и пароль');
        return;
    }
    
    fetch('/api/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentSession = {
                sessionId: data.sessionId,
                user: data.user
            };
            localStorage.setItem('adminSession', JSON.stringify(currentSession));
            showAdminPanel();
        } else {
            alert('Ошибка авторизации: ' + data.error);
            document.getElementById('password').value = ''; // Очищаем пароль
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        alert('Ошибка при авторизации');
        document.getElementById('password').value = ''; // Очищаем пароль
    });
}

// Показать панель администратора
function showAdminPanel() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'block';
    
    // Очищаем форму авторизации
    document.getElementById('loginForm').reset();
    
    // Загружаем начальные данные
    showSection('students');
    loadDormitories();
}

// Выход из системы
function handleLogout() {
    currentSession = null;
    localStorage.removeItem('adminSession');
    showLoginForm();
}

// Переключение между секциями
function showSection(sectionName) {
    // Скрываем все секции
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });
    
    // Показываем выбранную секцию
    document.getElementById(sectionName + 'Section').style.display = 'block';
    
    // Загружаем данные для секции
    switch(sectionName) {
        case 'students':
            loadStudents();
            break;
        case 'reports':
            // Очищаем результаты отчетов
            document.getElementById('reportResults').innerHTML = '';
            break;
    }
}

// Загрузка списка студентов
function loadStudents() {
    fetch('/api/students')
        .then(response => response.json())
        .then(students => {
            displayStudents(students);
        })
        .catch(error => {
            console.error('Ошибка при загрузке студентов:', error);
        });
}

// Отображение списка студентов с действиями
function displayStudents(students) {
    const container = document.getElementById('studentsList');
    
    if (students.length === 0) {
        container.innerHTML = '<p>Студенты не найдены</p>';
        return;
    }
    
    container.innerHTML = students.map(student => `
        <div class="student-card ${student.status}">
            <h3>${student.full_name}</h3>
            <p><strong>Статус:</strong> ${student.status === 'accommodated' ? 'Заселен' : 'В очереди'}</p>
            <p><strong>Средний доход на члена семьи:</strong> ${student.income_per_member ? student.income_per_member.toFixed(2) : 'N/A'}</p>
            <p><strong>Средний балл:</strong> ${student.average_grade}</p>
            <p><strong>Общественная нагрузка:</strong> ${student.social_activity ? 'Да' : 'Нет'}</p>
            ${student.dormitory_name ? `<p><strong>Общежитие:</strong> ${student.dormitory_name}</p>` : ''}
            ${student.queue_position ? `<p><strong>Позиция в очереди:</strong> ${student.queue_position}</p>` : ''}
            
            <div class="student-actions">
                ${student.status === 'waiting' ? 
                    `<button onclick="openAccommodateModal(${student.id})">Заселить</button>` : 
                    `<button onclick="evictStudent(${student.id})">Выселить</button>`
                }
            </div>
        </div>
    `).join('');
}

// Загрузка общежитий для выпадающего списка
function loadDormitories() {
    fetch('/api/dormitories')
        .then(response => response.json())
        .then(dormitories => {
            const select = document.getElementById('dormitorySelect');
            select.innerHTML = '<option value="">Выберите общежитие</option>' +
                dormitories.map(dorm => 
                    `<option value="${dorm.id}">${dorm.name} (${dorm.type === 'family' ? 'семейное' : 'несемейное'}) - Свободно: ${dorm.total_places - dorm.occupied_places}</option>`
                ).join('');
        })
        .catch(error => {
            console.error('Ошибка при загрузке общежитий:', error);
        });
}

// Открытие модального окна для заселения
function openAccommodateModal(studentId) {
    // Проверяем авторизацию
    if (!checkAuth()) return;
    
    document.getElementById('accommodateStudentId').value = studentId;
    document.getElementById('accommodateModal').style.display = 'flex';
    loadDormitories(); // Обновляем список общежитий
}

// Закрытие модального окна
function closeModal() {
    document.getElementById('accommodateModal').style.display = 'none';
}

// Проверка авторизации
function checkAuth() {
    if (!currentSession) {
        alert('Для выполнения этого действия необходимо авторизоваться');
        showLoginForm();
        return false;
    }
    return true;
}

// Обработка заселения студента
function handleAccommodation(e) {
    e.preventDefault();
    
    // Проверяем авторизацию
    if (!checkAuth()) return;
    
    const studentId = document.getElementById('accommodateStudentId').value;
    const dormitoryId = document.getElementById('dormitorySelect').value;
    
    if (!dormitoryId) {
        alert('Пожалуйста, выберите общежитие');
        return;
    }
    
    fetch(`/api/students/${studentId}/accommodate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            dormitory_id: dormitoryId
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            closeModal();
            loadStudents(); // Обновляем список студентов
        } else {
            alert('Ошибка: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        alert('Ошибка при заселении студента');
    });
}

// Выселение студента
function evictStudent(studentId) {
    // Проверяем авторизацию
    if (!checkAuth()) return;
    
    if (!confirm('Вы уверены, что хотите выселить этого студента?')) {
        return;
    }
    
    fetch(`/api/students/${studentId}/evict`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            loadStudents(); // Обновляем список студентов
        } else {
            alert('Ошибка: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        alert('Ошибка при выселении студента');
    });
}

// Загрузка следующего кандидата для заселения
function loadNextCandidate() {
    // Проверяем авторизацию
    if (!checkAuth()) return;
    
    fetch('/api/students/next-candidate')
        .then(response => response.json())
        .then(student => {
            if (student.id) {
                openAccommodateModal(student.id);
            } else {
                alert('Нет кандидатов для заселения');
            }
        })
        .catch(error => {
            console.error('Ошибка:', error);
            alert('Ошибка при загрузке кандидата');
        });
}

// Обработка регистрации заявки
function handleApplication(e) {
    e.preventDefault();
    
    // Проверяем авторизацию
    if (!checkAuth()) return;
    
    const formData = new FormData(e.target);
    const application = {
        full_name: document.getElementById('fullName').value,
        family_income: parseFloat(document.getElementById('familyIncome').value),
        family_members: parseInt(document.getElementById('familyMembers').value),
        average_grade: parseFloat(document.getElementById('averageGrade').value),
        social_activity: document.getElementById('socialActivity').checked
    };
    
    // Валидация данных
    if (!application.full_name || !application.family_income || !application.family_members || !application.average_grade) {
        alert('Пожалуйста, заполните все обязательные поля');
        return;
    }
    
    if (application.average_grade < 0 || application.average_grade > 10) {
        alert('Средний балл должен быть в диапазоне от 0 до 10');
        return;
    }
    
    fetch('/api/students', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(application)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            e.target.reset();
        } else {
            alert('Ошибка: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        alert('Ошибка при регистрации заявки');
    });
}

// Загрузка отчета о свободных местах
function loadFreePlacesReport() {
    // Проверяем авторизацию
    if (!checkAuth()) return;
    
    fetch('/api/reports/free-places')
        .then(response => response.json())
        .then(data => {
            displayReport(data, 'free-places');
        })
        .catch(error => {
            console.error('Ошибка:', error);
            alert('Ошибка при загрузке отчета');
        });
}

// Загрузка отчета об очереди
function loadQueueReport() {
    // Проверяем авторизацию
    if (!checkAuth()) return;
    
    fetch('/api/reports/queue')
        .then(response => response.json())
        .then(data => {
            displayReport(data, 'queue');
        })
        .catch(error => {
            console.error('Ошибка:', error);
            alert('Ошибка при загрузке отчета');
        });
}

// Отображение отчетов
function displayReport(data, reportType) {
    const container = document.getElementById('reportResults');
    
    if (data.length === 0) {
        container.innerHTML = '<p>Данные для отчета отсутствуют</p>';
        return;
    }
    
    let tableHTML = '';
    
    if (reportType === 'free-places') {
        tableHTML = `
            <table class="report-table">
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
                    ${data.map(row => `
                        <tr>
                            <td>${row.name}</td>
                            <td>${row.type === 'family' ? 'Семейное' : 'Несемейное'}</td>
                            <td>${row.total_places}</td>
                            <td>${row.occupied_places}</td>
                            <td>${row.free_places}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } else if (reportType === 'queue') {
        tableHTML = `
            <table class="report-table">
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
                    ${data.map(row => `
                        <tr>
                            <td>${row.queue_position}</td>
                            <td>${row.full_name}</td>
                            <td>${row.income_per_member.toFixed(2)}</td>
                            <td>${row.average_grade}</td>
                            <td>${row.social_activity ? 'Да' : 'Нет'}</td>
                            <td>${new Date(row.application_date).toLocaleDateString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
    
    container.innerHTML = tableHTML;
}
