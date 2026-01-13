let currentSession = null;
let currentFilter = 'all';

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Проверяем сохраненную сессию при загрузке страницы
    const savedSession = localStorage.getItem('adminSession');
    
    if (savedSession) {
        try {
            currentSession = JSON.parse(savedSession);
            // Проверяем сессию на сервере
            checkSessionOnServer();
        } catch (e) {
            console.error('Ошибка при загрузке сессии:', e);
            showLoginForm();
        }
    } else {
        showLoginForm();
    }
    
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('applicationForm').addEventListener('submit', handleApplication);
    document.getElementById('accommodateForm').addEventListener('submit', handleAccommodation);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    document.getElementById('studentFilter').addEventListener('change', function() {
        setFilter(this.value);
    });
    
    setupFormValidation();
});

// Проверка сессии на сервере
function checkSessionOnServer() {
    if (!currentSession || !currentSession.sessionId) {
        showLoginForm();
        return;
    }
    
    fetch('/api/check-session', {
        headers: {
            'X-Session-Id': currentSession.sessionId
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.valid) {
            showAdminPanel();
        } else {
            // Сессия невалидна, показываем форму входа
            localStorage.removeItem('adminSession');
            currentSession = null;
            showLoginForm();
            showError('Сессия истекла. Пожалуйста, войдите заново.');
        }
    })
    .catch(error => {
        console.error('Ошибка при проверке сессии:', error);
        // В случае ошибки сети, все равно показываем админку
        showAdminPanel();
    });
}

// Настройка валидации полей формы
function setupFormValidation() {
    const form = document.getElementById('applicationForm');
    
    const fullNameInput = document.getElementById('fullName');
    fullNameInput.addEventListener('input', function() {
        validateField(this, validateFullName);
    });
    
    const familyIncomeInput = document.getElementById('familyIncome');
    familyIncomeInput.addEventListener('input', function() {
        validateField(this, validateIncome);
    });
    
    const familyMembersInput = document.getElementById('familyMembers');
    familyMembersInput.addEventListener('input', function() {
        validateField(this, validateFamilyMembers);
    });
    
    const averageGradeInput = document.getElementById('averageGrade');
    averageGradeInput.addEventListener('input', function() {
        validateField(this, validateAverageGrade);
    });
}

// Валидация ФИО
function validateFullName(value) {
    if (!value || value.trim().length < 2) {
        return 'ФИО должно содержать минимум 2 символа';
    }
    if (value.trim().length > 100) {
        return 'ФИО слишком длинное (макс. 100 символов)';
    }
    return null;
}

// Валидация дохода
function validateIncome(value) {
    const income = parseFloat(value);
    if (isNaN(income) || income < 0) {
        return 'Доход должен быть положительным числом';
    }
    if (income > 10000000) {
        return 'Доход слишком большой (макс. 10,000,000)';
    }
    return null;
}

// Валидация количества членов семьи
function validateFamilyMembers(value) {
    const members = parseInt(value);
    if (isNaN(members) || members < 1) {
        return 'Количество членов семьи должно быть не менее 1';
    }
    if (members > 20) {
        return 'Количество членов семьи должно быть не более 20';
    }
    return null;
}

// Валидация среднего балла
function validateAverageGrade(value) {
    const grade = parseFloat(value);
    if (isNaN(grade)) {
        return 'Средний балл должен быть числом';
    }
    if (grade < 0 || grade > 10) {
        return 'Средний балл должен быть от 0 до 10';
    }
    return null;
}

// Валидация поля
function validateField(field, validator) {
    const error = validator(field.value);
    const errorElement = field.parentElement.querySelector('.field-error');
    
    if (error) {
        field.classList.add('error');
        if (errorElement) {
            errorElement.textContent = error;
        } else {
            const errorSpan = document.createElement('span');
            errorSpan.className = 'field-error';
            errorSpan.style.cssText = 'color: #e74c3c; font-size: 12px; margin-top: 5px; display: block;';
            errorSpan.textContent = error;
            field.parentElement.appendChild(errorSpan);
        }
        return false;
    } else {
        field.classList.remove('error');
        if (errorElement) {
            errorElement.remove();
        }
        return true;
    }
}

// Проверка всей формы
function validateForm() {
    const fields = [
        { id: 'fullName', validator: validateFullName },
        { id: 'familyIncome', validator: validateIncome },
        { id: 'familyMembers', validator: validateFamilyMembers },
        { id: 'averageGrade', validator: validateAverageGrade }
    ];
    
    let isValid = true;
    
    fields.forEach(field => {
        const element = document.getElementById(field.id);
        if (!validateField(element, field.validator)) {
            isValid = false;
        }
    });
    
    return isValid;
}

// Показать форму авторизации
function showLoginForm() {
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.style.display = 'none';
    }
}

// Обработка авторизации
function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        showError('Пожалуйста, введите имя пользователя и пароль');
        return;
    }
    
    // Показываем индикатор загрузки
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Вход...';
    submitBtn.disabled = true;
    
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
            showSuccess('Авторизация успешна!');
        } else {
            showError('Ошибка авторизации: ' + (data.error || 'Неверные учетные данные'));
            document.getElementById('password').value = '';
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        showError('Ошибка при авторизации. Проверьте подключение к серверу.');
        document.getElementById('password').value = '';
    })
    .finally(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    });
}

// Показать панель администратора
function showAdminPanel() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'block';
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.style.display = 'block';
    }
    
    document.getElementById('loginForm').reset();
    
    showSection('students');
    loadDormitories();
}

// Выход из системы
function handleLogout() {
    if (currentSession && currentSession.sessionId) {
        fetch('/api/logout', {
            method: 'POST',
            headers: {
                'X-Session-Id': currentSession.sessionId
            }
        })
        .catch(error => {
            console.error('Ошибка при выходе:', error);
        });
    }
    
    currentSession = null;
    localStorage.removeItem('adminSession');
    showLoginForm();
    showSuccess('Вы успешно вышли из системы');
}

// Переключение между секциями
function showSection(sectionName) {
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });
    
    document.getElementById(sectionName + 'Section').style.display = 'block';
    
    switch(sectionName) {
        case 'students':
            loadStudents();
            break;
        case 'reports':
            document.getElementById('reportResults').innerHTML = '';
            break;
        case 'export':
            loadExportStats();
            break;
    }
}

// Загрузка списка студентов
function loadStudents() {
    let url = '/api/students';
    
    if (currentFilter !== 'all') {
        url += `?status=${currentFilter}`;
    }
    
    fetch(url)
        .then(response => response.json())
        .then(students => {
            displayStudents(students);
            updateFilterDropdown();
        })
        .catch(error => {
            console.error('Ошибка при загрузке студентов:', error);
            showError('Ошибка при загрузке списка студентов');
        });
}

// Обновление выпадающего списка фильтра
function updateFilterDropdown() {
    const filterSelect = document.getElementById('studentFilter');
    if (filterSelect) {
        filterSelect.value = currentFilter;
    }
}

// Изменение фильтра
function setFilter(filter) {
    currentFilter = filter;
    loadStudents();
}

// Отображение списка студентов с действиями
function displayStudents(students) {
    const container = document.getElementById('studentsList');
    
    if (students.length === 0) {
        container.innerHTML = '<div class="no-data-message">Студенты не найдены</div>';
        return;
    }
    
    const accommodated = students.filter(s => s.status === 'accommodated');
    const waiting = students.filter(s => s.status === 'waiting');
    
    let html = '';
    
    if ((currentFilter === 'all' || currentFilter === 'waiting') && waiting.length > 0) {
        html += `<div class="status-group">
                    <h3><span class="status-badge waiting">В очереди</span> (${waiting.length} чел.)</h3>
                    <div class="students-grid">`;
        
        waiting.forEach(student => {
            html += createStudentCard(student);
        });
        
        html += `</div></div>`;
    }
    
    if ((currentFilter === 'all' || currentFilter === 'accommodated') && accommodated.length > 0) {
        html += `<div class="status-group">
                    <h3><span class="status-badge accommodated">Заселены</span> (${accommodated.length} чел.)</h3>
                    <div class="students-grid">`;
        
        accommodated.forEach(student => {
            html += createStudentCard(student);
        });
        
        html += `</div></div>`;
    }
    
    container.innerHTML = html;
}

// Создание карточки студента
function createStudentCard(student) {
    const incomePerMember = student.family_income / student.family_members;
    
    return `
        <div class="student-card ${student.status}">
            <div class="student-header">
                <h3>${student.full_name}</h3>
                <span class="student-status ${student.status}">
                    ${student.status === 'accommodated' ? 'Заселен' : 'В очереди'}
                </span>
            </div>
            
            <div class="student-info">
                <div class="info-row">
                    <span class="info-label">Средний доход на члена семьи:</span>
                    <span class="info-value">${incomePerMember.toFixed(2)} руб.</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Средний балл:</span>
                    <span class="info-value">${student.average_grade}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Общественная нагрузка:</span>
                    <span class="info-value ${student.social_activity ? 'yes' : 'no'}">
                        ${student.social_activity ? 'Да' : 'Нет'}
                    </span>
                </div>
                ${student.dormitory_name ? `
                <div class="info-row">
                    <span class="info-label">Общежитие:</span>
                    <span class="info-value">${student.dormitory_name}</span>
                </div>` : ''}
                ${student.status === 'waiting' ? `
                <div class="info-row">
                    <span class="info-label">Позиция в очереди:</span>
                    <span class="info-value">${student.queue_position || 'Рассчитывается...'}</span>
                </div>` : ''}
            </div>
            
            <div class="student-actions">
                ${student.status === 'waiting' ? 
                    `<button class="btn-accommodate" onclick="openAccommodateModal(${student.id}, '${student.full_name.replace(/'/g, "\\'")}')">
                        <i class="action-icon"></i> Заселить
                    </button>` : 
                    `<button class="btn-evict" onclick="evictStudent(${student.id}, '${student.full_name.replace(/'/g, "\\'")}')">
                        <i class="action-icon"></i> Выселить
                    </button>`
                }
            </div>
        </div>
    `;
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
function openAccommodateModal(studentId, studentName = '') {
    if (!checkAuth()) {
        showError('Для выполнения этого действия необходимо авторизоваться');
        return;
    }
    
    document.getElementById('accommodateStudentId').value = studentId;
    document.getElementById('accommodateModal').style.display = 'flex';
    
    // Добавляем имя студента в заголовок для наглядности
    const modalTitle = document.querySelector('#accommodateModal h3');
    if (modalTitle && studentName) {
        modalTitle.textContent = `Заселение студента: ${studentName}`;
    }
    
    loadDormitories();
}

// Закрытие модального окна
function closeModal() {
    document.getElementById('accommodateModal').style.display = 'none';
    // Восстанавливаем стандартный заголовок
    const modalTitle = document.querySelector('#accommodateModal h3');
    if (modalTitle) {
        modalTitle.textContent = 'Заселение студента';
    }
}

// Проверка авторизации
function checkAuth() {
    if (!currentSession || !currentSession.sessionId) {
        // Пробуем загрузить из localStorage
        const savedSession = localStorage.getItem('adminSession');
        if (savedSession) {
            try {
                currentSession = JSON.parse(savedSession);
                return true;
            } catch (e) {
                console.error('Ошибка при загрузке сессии:', e);
            }
        }
        
        showError('Для выполнения этого действия необходимо авторизоваться');
        showLoginForm();
        return false;
    }
    return true;
}

// Обработка заселения студента
function handleAccommodation(e) {
    e.preventDefault();
    
    if (!checkAuth()) {
        showError('Для выполнения этого действия необходимо авторизоваться');
        return;
    }
    
    const studentId = document.getElementById('accommodateStudentId').value;
    const dormitoryId = document.getElementById('dormitorySelect').value;
    
    if (!studentId) {
        showError('Ошибка: не указан ID студента');
        return;
    }
    
    if (!dormitoryId) {
        showError('Пожалуйста, выберите общежитие');
        return;
    }
    
    showSuccess('Выполняется заселение студента...');
    
    fetch(`/api/students/${studentId}/accommodate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Session-Id': currentSession.sessionId
        },
        body: JSON.stringify({
            dormitory_id: dormitoryId
        })
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 401) {
                handleSessionExpired();
                throw new Error('Сессия истекла');
            }
            return response.json().then(data => {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            showSuccess(data.message || 'Студент успешно заселен');
            closeModal();
            loadStudents();
        } else {
            showError('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
        }
    })
    .catch(error => {
        console.error('Ошибка при заселении:', error);
        showError('Ошибка при заселении студента: ' + error.message);
    });
}

// Обработка истекшей сессии
function handleSessionExpired() {
    localStorage.removeItem('adminSession');
    currentSession = null;
    showLoginForm();
    showError('Сессия истекла. Пожалуйста, войдите заново.');
}

// Выселение студента
function evictStudent(studentId, studentName = '') {
    if (!checkAuth()) {
        showError('Для выполнения этого действия необходимо авторизоваться');
        return;
    }
    
    const confirmMessage = studentName 
        ? `Вы уверены, что хотите выселить студента "${studentName}"?`
        : 'Вы уверены, что хотите выселить этого студента?';
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    showSuccess('Выполняется выселение студента...');
    
    fetch(`/api/students/${studentId}/evict`, {
        method: 'POST',
        headers: {
            'X-Session-Id': currentSession.sessionId
        }
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 401) {
                handleSessionExpired();
                throw new Error('Сессия истекла');
            }
            return response.json().then(data => {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            showSuccess(data.message || 'Студент успешно выселен');
            loadStudents();
        } else {
            showError('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
        }
    })
    .catch(error => {
        console.error('Ошибка при выселении:', error);
        showError('Ошибка при выселении студента: ' + error.message);
    });
}

// Загрузка следующего кандидата для заселения
function loadNextCandidate() {
    if (!checkAuth()) {
        showError('Для выполнения этого действия необходимо авторизоваться');
        return;
    }
    
    showSuccess('Поиск следующего кандидата...');
    
    fetch('/api/students/next-candidate', {
        headers: {
            'X-Session-Id': currentSession.sessionId
        }
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 401) {
                handleSessionExpired();
                throw new Error('Сессия истекла');
            }
            return response.json().then(data => {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(student => {
        if (student && student.id) {
            openAccommodateModal(student.id, student.full_name);
            showSuccess(`Найден кандидат: ${student.full_name}`);
        } else {
            showError('Нет кандидатов для заселения');
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        showError('Ошибка при загрузке кандидата: ' + error.message);
    });
}

// Обработка регистрации заявки
function handleApplication(e) {
    e.preventDefault();
    
    if (!checkAuth()) {
        showError('Для выполнения этого действия необходимо авторизоваться');
        return;
    }
    
    if (!validateForm()) {
        showError('Пожалуйста, исправьте ошибки в форме');
        return;
    }
    
    const application = {
        full_name: document.getElementById('fullName').value.trim(),
        family_income: parseFloat(document.getElementById('familyIncome').value),
        family_members: parseInt(document.getElementById('familyMembers').value),
        average_grade: parseFloat(document.getElementById('averageGrade').value),
        social_activity: document.getElementById('socialActivity').checked
    };
    
    showSuccess('Регистрация заявки...');
    
    fetch('/api/students', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Session-Id': currentSession.sessionId
        },
        body: JSON.stringify(application)
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 401) {
                handleSessionExpired();
                throw new Error('Сессия истекла');
            }
            return response.json().then(data => {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            showSuccess(data.message || 'Заявка успешно зарегистрирована');
            e.target.reset();
            loadStudents();
        } else {
            showError('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        showError('Ошибка при регистрации заявки: ' + error.message);
    });
}

// Загрузка отчета о свободных местах
function loadFreePlacesReport() {
    if (!checkAuth()) {
        showError('Для выполнения этого действия необходимо авторизоваться');
        return;
    }
    
    showSuccess('Загрузка отчета о свободных местах...');
    
    fetch('/api/reports/free-places', {
        headers: {
            'X-Session-Id': currentSession.sessionId
        }
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 401) {
                handleSessionExpired();
                throw new Error('Сессия истекла');
            }
            return response.json().then(data => {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        displayReport(data, 'free-places');
    })
    .catch(error => {
        console.error('Ошибка:', error);
        showError('Ошибка при загрузке отчета: ' + error.message);
    });
}

// Загрузка отчета об очереди
function loadQueueReport() {
    if (!checkAuth()) {
        showError('Для выполнения этого действия необходимо авторизоваться');
        return;
    }
    
    showSuccess('Загрузка отчета об очереди...');
    
    fetch('/api/reports/queue', {
        headers: {
            'X-Session-Id': currentSession.sessionId
        }
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 401) {
                handleSessionExpired();
                throw new Error('Сессия истекла');
            }
            return response.json().then(data => {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        displayReport(data, 'queue');
    })
    .catch(error => {
        console.error('Ошибка:', error);
        showError('Ошибка при загрузке отчета: ' + error.message);
    });
}

// Загрузка отчета о заселенных студентах
function loadAccommodatedReport() {
    if (!checkAuth()) {
        showError('Для выполнения этого действия необходимо авторизоваться');
        return;
    }
    
    showSuccess('Загрузка отчета о заселенных студентах...');
    
    fetch('/api/reports/accommodated', {
        headers: {
            'X-Session-Id': currentSession.sessionId
        }
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 401) {
                handleSessionExpired();
                throw new Error('Сессия истекла');
            }
            return response.json().then(data => {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        displayReport(data, 'accommodated');
    })
    .catch(error => {
        console.error('Ошибка:', error);
        showError('Ошибка при загрузке отчета: ' + error.message);
    });
}

// Отображение отчетов
function displayReport(data, reportType) {
    const container = document.getElementById('reportResults');
    
    if (!data || data.length === 0) {
        container.innerHTML = '<p>Данные для отчета отсутствуют</p>';
        return;
    }
    
    let tableHTML = '';
    
    switch(reportType) {
        case 'free-places':
            tableHTML = `
                <div class="export-buttons">
                    <button onclick="exportReport('free-places', 'txt')"> Экспорт в TXT</button>
                    <button onclick="exportReport('free-places', 'html')"> Экспорт в HTML</button>
                </div>
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
            break;
            
        case 'queue':
            tableHTML = `
                <div class="export-buttons">
                    <button onclick="exportReport('queue', 'txt')"> Экспорт в TXT</button>
                    <button onclick="exportReport('queue', 'html')"> Экспорт в HTML</button>
                </div>
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
                                <td>${row.income_per_member?.toFixed(2) || '0.00'}</td>
                                <td>${row.average_grade}</td>
                                <td>${row.social_activity ? 'Да' : 'Нет'}</td>
                                <td>${new Date(row.application_date).toLocaleDateString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            break;
            
        case 'accommodated':
            tableHTML = `
                <div class="export-buttons">
                    <button onclick="exportReport('accommodated', 'txt')">Экспорт в TXT</button>
                    <button onclick="exportReport('accommodated', 'html')">Экспорт в HTML</button>
                </div>
                <table class="report-table">
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
                        ${data.map(row => `
                            <tr>
                                <td>${row.full_name}</td>
                                <td>${row.average_grade}</td>
                                <td>${row.social_activity ? 'Да' : 'Нет'}</td>
                                <td>${new Date(row.application_date).toLocaleDateString()}</td>
                                <td>${row.dormitory_name || 'Нет'}</td>
                                <td>${row.dormitory_type === 'family' ? 'Семейное' : 'Несемейное'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            break;
    }
    
    container.innerHTML = tableHTML;
}

// Экспорт отчета
function exportReport(reportType, format) {
    if (!checkAuth()) {
        showError('Для выполнения этого действия необходимо авторизоваться');
        return;
    }
    
    const displayFormat = format.toUpperCase();
    
    showExportNotification(`Начинается экспорт отчета "${getReportName(reportType)}" в формате ${displayFormat}...`);
    
    const url = `/api/export/${reportType}/${format}?sessionId=${currentSession.sessionId}`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${reportType}_${new Date().toISOString().slice(0,10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    setTimeout(() => {
        showExportNotification(`Отчет "${getReportName(reportType)}" успешно экспортирован в формате ${displayFormat}!`, 'success');
    }, 500);
}

// Экспорт всех отчетов
function exportAllReports(format) {
    if (!checkAuth()) {
        showError('Для выполнения этого действия необходимо авторизоваться');
        return;
    }
    
    const displayFormat = format.toUpperCase();
    
    showExportNotification(`Начинается экспорт всех отчетов в формате ${displayFormat}...`);
    
    const url = `/api/export/all/${format}?sessionId=${currentSession.sessionId}`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `all_reports_${new Date().toISOString().slice(0,10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    setTimeout(() => {
        showExportNotification(`Все отчеты успешно экспортированы в формате ${displayFormat}!`, 'success');
    }, 500);
}

// Получение названия отчета по типу
function getReportName(reportType) {
    const names = {
        'free-places': 'Свободные места в общежитиях',
        'queue': 'Очередь на заселение',
        'accommodated': 'Заселенные студенты',
        'all': 'Все отчеты'
    };
    return names[reportType] || reportType;
}

// Показ уведомления 
function showExportNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `export-notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#2ecc71' : '#3498db'};
        color: white;
        border-radius: 5px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 1000;
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Загрузка статистики для экспорта
function loadExportStats() {
    if (!checkAuth()) {
        showError('Для выполнения этого действия необходимо авторизоваться');
        return;
    }
    
    Promise.all([
        fetch('/api/students').then(r => r.json()),
        fetch('/api/dormitories').then(r => r.json()),
        fetch('/api/reports/queue', {
            headers: {
                'X-Session-Id': currentSession.sessionId
            }
        }).then(r => r.json()),
        fetch('/api/reports/accommodated', {
            headers: {
                'X-Session-Id': currentSession.sessionId
            }
        }).then(r => r.json())
    ])
    .then(([students, dormitories, queue, accommodated]) => {
        const totalStudents = students.length;
        const waitingStudents = queue.length;
        const accommodatedStudents = accommodated.length;
        
        let totalPlaces = 0;
        let occupiedPlaces = 0;
        let freePlaces = 0;
        
        dormitories.forEach(dorm => {
            totalPlaces += dorm.total_places;
            occupiedPlaces += dorm.occupied_places;
            freePlaces += (dorm.total_places - dorm.occupied_places);
        });
        
        const statsHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Всего студентов</div>
                    <div class="stat-value">${totalStudents}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">В очереди</div>
                    <div class="stat-value">${waitingStudents}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Заселено</div>
                    <div class="stat-value">${accommodatedStudents}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Всего мест</div>
                    <div class="stat-value">${totalPlaces}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Занято мест</div>
                    <div class="stat-value">${occupiedPlaces}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Свободно мест</div>
                    <div class="stat-value">${freePlaces}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Общежитий</div>
                    <div class="stat-value">${dormitories.length}</div>
                </div>
            </div>
            <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px;">
                <p><strong>Готово к экспорту:</strong> ${totalStudents} записей</p>
                <p><strong>Рекомендуемый формат:</strong> Для анализа данных используйте TXT, для печати - HTML</p>
            </div>
        `;
        
        const statsContent = document.getElementById('statsContent');
        if (statsContent) {
            statsContent.innerHTML = statsHTML;
        }
        
        const lastExport = localStorage.getItem('lastExport');
        if (lastExport) {
            const lastExportTime = document.getElementById('lastExportTime');
            if (lastExportTime) {
                lastExportTime.textContent = new Date(lastExport).toLocaleString();
            }
        }
    })
    .catch(error => {
        console.error('Ошибка при загрузке статистики:', error);
        const statsContent = document.getElementById('statsContent');
        if (statsContent) {
            statsContent.innerHTML = '<p>Ошибка при загрузке статистики. Пожалуйста, попробуйте позже.</p>';
        }
    });
}

// Показать сообщение об ошибке
function showError(message) {
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: #e74c3c;
        color: white;
        border-radius: 5px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 1000;
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Показать сообщение об успехе
function showSuccess(message) {
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: #2ecc71;
        color: white;
        border-radius: 5px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 1000;
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Добавляем стили для анимаций уведомлений
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    input.error {
        border-color: #e74c3c !important;
        background-color: #fff5f5;
    }
`;
document.head.appendChild(style);
