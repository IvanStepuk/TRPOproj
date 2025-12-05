let currentFilter = 'all'; // all, accommodated, waiting

// Загрузка списка студентов при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    loadStudents();
    
    // Обработчик изменения фильтра
    document.getElementById('studentFilter').addEventListener('change', function() {
        setFilter(this.value);
    });
});

// Загрузка списка студентов
function loadStudents(search = '') {
    let url = '/api/students';
    
    // Добавляем параметры поиска и фильтра
    const params = new URLSearchParams();
    
    if (search) {
        params.append('search', search);
    }
    
    if (currentFilter !== 'all') {
        params.append('status', currentFilter);
    }
    
    if (params.toString()) {
        url += `?${params.toString()}`;
    }
    
    fetch(url)
        .then(response => response.json())
        .then(students => {
            displayStudents(students);
            updateFilterDropdown();
        })
        .catch(error => {
            console.error('Ошибка при загрузке студентов:', error);
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
    const searchInput = document.getElementById('searchInput');
    loadStudents(searchInput.value.trim());
}

// Отображение списка студентов
function displayStudents(students) {
    const container = document.getElementById('studentsList');
    
    if (students.length === 0) {
        container.innerHTML = '<div class="no-data-message">Студенты не найдены</div>';
        return;
    }
    
    // Группируем студентов по статусу для лучшей организации
    const accommodated = students.filter(s => s.status === 'accommodated');
    const waiting = students.filter(s => s.status === 'waiting');
    
    let html = '';
    
    // Если показываем всех или только в очереди и есть ожидающие
    if ((currentFilter === 'all' || currentFilter === 'waiting') && waiting.length > 0) {
        html += `<div class="status-group">
                    <h3><span class="status-badge waiting">В очереди</span> (${waiting.length} чел.)</h3>
                    <div class="students-grid">`;
        
        waiting.forEach(student => {
            html += createStudentCard(student);
        });
        
        html += `</div></div>`;
    }
    
    // Если показываем всех или только заселенных и есть заселенные
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

// Создание карточки студента (публичная версия)
function createStudentCard(student) {
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
                    <span class="info-value">${student.income_per_member ? student.income_per_member.toFixed(2) + ' руб.' : 'N/A'}</span>
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
                ${student.queue_position ? `
                <div class="info-row">
                    <span class="info-label">Позиция в очереди:</span>
                    <span class="info-value">${student.queue_position}</span>
                </div>` : ''}
            </div>
        </div>
    `;
}

// Поиск студентов
function searchStudents() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput.value.trim();
    loadStudents(searchTerm);
}

// Очистка поиска
function clearSearch() {
    document.getElementById('searchInput').value = '';
    loadStudents();
}