let currentUser = null;
let currentApplication = null;

document.addEventListener('DOMContentLoaded', function() {
    // Проверка авторизации
    const userData = localStorage.getItem('user');
    if (!userData) {
        window.location.href = 'login.html';
        return;
    }
    
    currentUser = JSON.parse(userData);
    if (currentUser.role !== 'student') {
        window.location.href = 'login.html';
        return;
    }
    
    document.getElementById('userName').textContent = currentUser.full_name;
    
    // Загрузка данных
    loadApplication();
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
    if (sectionName === 'queue' && currentApplication) {
        loadQueuePosition();
    }
}

function loadApplication() {
    fetch(`/api/application/${currentUser.id}`)
        .then(response => response.json())
        .then(result => {
            const applicationInfo = document.getElementById('applicationInfo');
            const applicationFormContainer = document.getElementById('applicationFormContainer');
            const applicationActions = document.getElementById('applicationActions');
            
            if (result.application) {
                currentApplication = result.application;
                applicationInfo.innerHTML = `
                    <div class="application-card">
                        <div class="application-info">
                            <div class="info-item">
                                <span class="info-label">Тип общежития:</span>
                                <span class="info-value">${getDormitoryTypeText(result.application.dormitory_type)}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Средний доход:</span>
                                <span class="info-value">${result.application.family_income} руб.</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Средний балл:</span>
                                <span class="info-value">${result.application.average_grade}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Общественная нагрузка:</span>
                                <span class="info-value">${result.application.social_activity ? 'Да' : 'Нет'}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Статус:</span>
                                <span class="info-value">${getApplicationStatusText(result.application.status)}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Приоритетный балл:</span>
                                <span class="info-value">${result.application.priority_score.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                `;
                applicationFormContainer.style.display = 'none';
                
                if (result.application.status === 'pending') {
                    applicationActions.style.display = 'block';
                } else {
                    applicationActions.style.display = 'none';
                }
            } else {
                applicationInfo.innerHTML = '<p>У вас нет активной заявки</p>';
                applicationFormContainer.style.display = 'block';
                applicationActions.style.display = 'none';
            }
        })
        .catch(error => {
            showMessage('Ошибка загрузки заявки', 'error');
        });
}

function loadQueuePosition() {
    if (!currentApplication) return;
    
    fetch(`/api/queue/position/${currentApplication.id}`)
        .then(response => response.json())
        .then(result => {
            document.getElementById('queueInfo').innerHTML = `
                <div class="application-card">
                    <p>Ваше место в очереди: <strong>${result.position}</strong></p>
                    <p>Тип общежития: ${getDormitoryTypeText(currentApplication.dormitory_type)}</p>
                    <p>Приоритетный балл: ${currentApplication.priority_score.toFixed(2)}</p>
                </div>
            `;
        })
        .catch(error => {
            showMessage('Ошибка загрузки позиции в очереди', 'error');
        });
}

function loadDormitories() {
    fetch('/api/dormitories')
        .then(response => response.json())
        .then(result => {
            const dormitoriesInfo = document.getElementById('dormitoriesInfo');
            dormitoriesInfo.innerHTML = result.dormitories.map(dorm => `
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
                    </div>
                </div>
            `).join('');
        })
        .catch(error => {
            showMessage('Ошибка загрузки информации об общежитиях', 'error');
        });
}

// Обработка подачи заявки
document.getElementById('applicationForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const data = {
        student_id: currentUser.id,
        dormitory_type: formData.get('dormitory_type'),
        family_income: parseFloat(formData.get('family_income')),
        average_grade: parseFloat(formData.get('average_grade')),
        social_activity: formData.get('social_activity') === 'on'
    };
    
    fetch('/api/application', {
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
            showMessage('Заявка успешно подана!', 'success');
            loadApplication();
        }
    })
    .catch(error => {
        showMessage('Ошибка подачи заявки', 'error');
    });
});

function editApplication() {
    if (!currentApplication) return;
    
    document.getElementById('applicationInfo').style.display = 'none';
    document.getElementById('applicationActions').style.display = 'none';
    document.getElementById('applicationFormContainer').style.display = 'block';
    
    // Заполнение формы текущими данными
    document.getElementById('dormitoryType').value = currentApplication.dormitory_type;
    document.getElementById('familyIncome').value = currentApplication.family_income;
    document.getElementById('averageGrade').value = currentApplication.average_grade;
    document.getElementById('socialActivity').checked = currentApplication.social_activity;
    
    // Изменение обработчика формы для обновления
    const form = document.getElementById('applicationForm');
    form.onsubmit = function(e) {
        e.preventDefault();
        
        const formData = new FormData(this);
        const data = {
            dormitory_type: formData.get('dormitory_type'),
            family_income: parseFloat(formData.get('family_income')),
            average_grade: parseFloat(formData.get('average_grade')),
            social_activity: formData.get('social_activity') === 'on'
        };
        
        fetch(`/api/application/${currentApplication.id}`, {
            method: 'PUT',
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
                showMessage('Заявка успешно обновлена!', 'success');
                loadApplication();
                document.getElementById('applicationFormContainer').style.display = 'none';
                document.getElementById('applicationInfo').style.display = 'block';
            }
        })
        .catch(error => {
            showMessage('Ошибка обновления заявки', 'error');
        });
    };
}

function cancelApplication() {
    if (!currentApplication || !confirm('Вы уверены, что хотите отменить заявку?')) {
        return;
    }
    
    fetch(`/api/application/${currentApplication.id}/cancel`, {
        method: 'PUT'
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            showMessage(result.error, 'error');
        } else {
            showMessage('Заявка отменена', 'success');
            currentApplication = null;
            loadApplication();
        }
    })
    .catch(error => {
        showMessage('Ошибка отмены заявки', 'error');
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