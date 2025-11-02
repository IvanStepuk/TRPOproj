let currentUser = null;

document.addEventListener('DOMContentLoaded', function() {
    // Проверка авторизации
    const userData = localStorage.getItem('user');
    if (!userData) {
        window.location.href = 'login.html';
        return;
    }
    
    currentUser = JSON.parse(userData);
    if (currentUser.role !== 'admin') {
        window.location.href = 'login.html';
        return;
    }
    
    document.getElementById('userName').textContent = currentUser.full_name;
    
    // Загрузка начальных данных
    loadApplications();
    loadDormitories();
});

function showSection(sectionName) {
    // Скрыть все секции
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });
    
    // Показать выбранную секцию
    document.getElementById(sectionName + 'Section').style.display = 'block';
    
    // Загрузить данные для секции, если необходимо
    if (sectionName === 'residents') {
        loadResidents();
    } else if (sectionName === 'dormitories') {
        loadDormitories();
    }
}

function loadApplications() {
    const filter = document.getElementById('applicationFilter').value;
    let url = '/api/applications';
    
    fetch(url)
        .then(response => response.json())
        .then(result => {
            const applicationsList = document.getElementById('applicationsList');
            
            if (result.applications.length === 0) {
                applicationsList.innerHTML = '<p>Нет заявок</p>';
                return;
            }
            
            applicationsList.innerHTML = result.applications.map(app => {
                if (filter !== 'all' && app.status !== filter) {
                    return '';
                }
                
                return `
                    <div class="application-card">
                        <div class="application-info">
                            <div class="info-item">
                                <span class="info-label">Студент:</span>
                                <span class="info-value">${app.full_name}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Тип общежития:</span>
                                <span class="info-value">${getDormitoryTypeText(app.dormitory_type)}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Средний доход:</span>
                                <span class="info-value">${app.family_income} руб.</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Средний балл:</span>
                                <span class="info-value">${app.average_grade}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Общественная нагрузка:</span>
                                <span class="info-value">${app.social_activity ? 'Да' : 'Нет'}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Приоритетный балл:</span>
                                <span class="info-value">${app.priority_score.toFixed(2)}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Статус:</span>
                                <span class="info-value">${getApplicationStatusText(app.status)}</span>
                            </div>
                        </div>
                        <div class="actions">
                            ${app.status === 'pending' ? `
                                <button class="btn-success" onclick="checkInStudent(${app.id})">Заселить</button>
                                <button class="btn-danger" onclick="rejectApplication(${app.id})">Отклонить</button>
                            ` : ''}
                            ${app.status === 'approved' ? `
                                <span class="info-value">Заявка одобрена</span>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        })
        .catch(error => {
            showMessage('Ошибка загрузки заявок', 'error');
        });
}

function loadResidents() {
    fetch('/api/residents')
        .then(response => response.json())
        .then(result => {
            const residentsList = document.getElementById('residentsList');
            
            if (result.residents.length === 0) {
                residentsList.innerHTML = '<p>Нет проживающих студентов</p>';
                return;
            }
            
            residentsList.innerHTML = result.residents.map(resident => `
                <div class="resident-card">
                    <div class="resident-info">
                        <div class="info-item">
                            <span class="info-label">Студент:</span>
                            <span class="info-value">${resident.full_name}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Общежитие:</span>
                            <span class="info-value">${resident.dormitory_name}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Комната:</span>
                            <span class="info-value">${resident.room_number}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Дата заселения:</span>
                            <span class="info-value">${new Date(resident.check_in_date).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div class="actions">
                        <button class="btn-danger" onclick="checkOutStudent(${resident.id})">Выселить</button>
                    </div>
                </div>
            `).join('');
        })
        .catch(error => {
            showMessage('Ошибка загрузки списка проживающих', 'error');
        });
}

function loadDormitories() {
    fetch('/api/dormitories')
        .then(response => response.json())
        .then(result => {
            const dormitoriesList = document.getElementById('dormitoriesList');
            
            dormitoriesList.innerHTML = result.dormitories.map(dorm => `
                <div class="application-card">
                    <h3>${dorm.name}</h3>
                    <div class="application-info">
                        <div class="info-item">
                            <span class="info-label">Тип:</span>
                            <span class="info-value">${getDormitoryTypeText(dorm.type)}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Всего комнат:</span>
                            <span class="info-value">${dorm.total_rooms}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Занято комнат:</span>
                            <span class="info-value">${dorm.occupied_rooms}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Свободно комнат:</span>
                            <span class="info-value">${dorm.total_rooms - dorm.occupied_rooms}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Заполненность:</span>
                            <span class="info-value">${((dorm.occupied_rooms / dorm.total_rooms) * 100).toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            `).join('');
        })
        .catch(error => {
            showMessage('Ошибка загрузки информации об общежитиях', 'error');
        });
}

function checkInStudent(applicationId) {
    // Сохраняем ID заявки
    document.getElementById('checkInApplicationId').value = applicationId;
    
    // Загружаем список общежитий
    fetch('/api/dormitories')
        .then(response => response.json())
        .then(result => {
            const dormitorySelect = document.getElementById('checkInDormitory');
            dormitorySelect.innerHTML = result.dormitories.map(dorm => 
                `<option value="${dorm.id}">${dorm.name} (${getDormitoryTypeText(dorm.type)}) - Свободно: ${dorm.total_rooms - dorm.occupied_rooms}</option>`
            ).join('');
        });
    
    // Показываем модальное окно
    document.getElementById('checkInModal').style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Обработка формы заселения
document.getElementById('checkInForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const data = {
        application_id: document.getElementById('checkInApplicationId').value,
        dormitory_id: document.getElementById('checkInDormitory').value,
        room_number: document.getElementById('checkInRoom').value
    };
    
    fetch('/api/check-in', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            showMessage(result.error, 'error');
        } else {
            showMessage('Студент успешно заселен!', 'success');
            closeModal('checkInModal');
            loadApplications();
            loadDormitories();
        }
    })
    .catch(error => {
        showMessage('Ошибка заселения', 'error');
    });
});

function checkOutStudent(residentId) {
    if (!confirm('Вы уверены, что хотите выселить студента?')) {
        return;
    }
    
    fetch('/api/check-out', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ resident_id: residentId })
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            showMessage(result.error, 'error');
        } else {
            showMessage('Студент выселен', 'success');
            loadResidents();
            loadDormitories();
        }
    })
    .catch(error => {
        showMessage('Ошибка выселения', 'error');
    });
}

function rejectApplication(applicationId) {
    if (!confirm('Вы уверены, что хотите отклонить заявку?')) {
        return;
    }
    
    // В реальном приложении здесь был бы API для отклонения заявки
    showMessage('Функция отклонения заявки будет реализована в следующей версии', 'info');
}

function generateVacancyReport() {
    fetch('/api/dormitories')
        .then(response => response.json())
        .then(result => {
            const reportOutput = document.getElementById('reportOutput');
            let html = '<h3>Отчет о свободных местах в общежитиях</h3>';
            html += '<table><tr><th>Общежитие</th><th>Тип</th><th>Всего мест</th><th>Занято</th><th>Свободно</th><th>Заполненность</th></tr>';
            
            result.dormitories.forEach(dorm => {
                const freeRooms = dorm.total_rooms - dorm.occupied_rooms;
                const occupancy = ((dorm.occupied_rooms / dorm.total_rooms) * 100).toFixed(1);
                html += `<tr>
                    <td>${dorm.name}</td>
                    <td>${getDormitoryTypeText(dorm.type)}</td>
                    <td>${dorm.total_rooms}</td>
                    <td>${dorm.occupied_rooms}</td>
                    <td>${freeRooms}</td>
                    <td>${occupancy}%</td>
                </tr>`;
            });
            
            html += '</table>';
            reportOutput.innerHTML = html;
        })
        .catch(error => {
            showMessage('Ошибка генерации отчета', 'error');
        });
}

function generateQueueReport() {
    fetch('/api/applications')
        .then(response => response.json())
        .then(result => {
            const reportOutput = document.getElementById('reportOutput');
            let html = '<h3>Отчет об очереди на получение места в общежитии</h3>';
            html += '<table><tr><th>Студент</th><th>Тип общежития</th><th>Приоритетный балл</th><th>Статус</th><th>Дата подачи</th></tr>';
            
            result.applications.forEach(app => {
                html += `<tr>
                    <td>${app.full_name}</td>
                    <td>${getDormitoryTypeText(app.dormitory_type)}</td>
                    <td>${app.priority_score.toFixed(2)}</td>
                    <td>${getApplicationStatusText(app.status)}</td>
                    <td>${new Date(app.application_date).toLocaleDateString()}</td>
                </tr>`;
            });
            
            html += '</table>';
            reportOutput.innerHTML = html;
        })
        .catch(error => {
            showMessage('Ошибка генерации отчета', 'error');
        });
}

function logout() {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

function getDormitoryTypeText(type) {
    return type === 'family' ? 'Семейное' : 'Несемейное';
}

function getApplicationStatusText(status) {
    const statusMap = {
        'pending': 'Ожидание',
        'approved': 'Одобрена',
        'rejected': 'Отклонена',
        'cancelled': 'Отменена'
    };
    return statusMap[status] || status;
}

function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}