// Загрузка списка студентов при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    loadStudents();
});

// Загрузка списка студентов
function loadStudents(search = '') {
    let url = '/api/students';
    if (search) {
        url += `?search=${encodeURIComponent(search)}`;
    }
    
    fetch(url)
        .then(response => response.json())
        .then(students => {
            displayStudents(students);
        })
        .catch(error => {
            console.error('Ошибка при загрузке студентов:', error);
        });
}

// Отображение списка студентов
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
            ${student.room_number ? `<p><strong>Комната:</strong> ${student.room_number}</p>` : ''}
            ${student.queue_position ? `<p><strong>Позиция в очереди:</strong> ${student.queue_position}</p>` : ''}
        </div>
    `).join('');
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