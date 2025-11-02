// Проверка параметров URL для определения формы
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('register') === 'true') {
        showRegister();
    }
});

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

function showLogin() {
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
}

// Обработка формы входа
document.getElementById('loginFormElement').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const data = {
        username: formData.get('username'),
        password: formData.get('password')
    };
    
    fetch('/api/login', {
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
            // Сохраняем информацию о пользователе
            localStorage.setItem('user', JSON.stringify(result.user));
            
            // Перенаправляем в зависимости от роли
            if (result.user.role === 'admin') {
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'student.html';
            }
        }
    })
    .catch(error => {
        showMessage('Ошибка соединения с сервером', 'error');
    });
});

// Обработка формы регистрации
document.getElementById('registerFormElement').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const data = {
        username: formData.get('username'),
        password: formData.get('password'),
        full_name: formData.get('full_name'),
        email: formData.get('email'),
        phone: formData.get('phone')
    };
    
    fetch('/api/register', {
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
            showMessage('Регистрация успешна! Теперь вы можете войти.', 'success');
            setTimeout(() => {
                showLogin();
            }, 2000);
        }
    })
    .catch(error => {
        showMessage('Ошибка соединения с сервером', 'error');
    });
});

function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}