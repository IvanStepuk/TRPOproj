let currentFilter = 'all';

// Загрузка списка студентов при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    loadStudents();
    
    document.getElementById('studentFilter').addEventListener('change', function() {
        setFilter(this.value);
    });
});

// Загрузка списка студентов
function loadStudents(search = '') {
    let url = '/api/students';
    
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

// Создание карточки студента (публичная версия)
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