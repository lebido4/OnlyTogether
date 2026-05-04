import { LogIn, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getApiError } from '../api.js';
import { useAuth } from '../state/AuthContext.jsx';

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [form, setForm] = useState({ email: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      if (isRegister) {
        await register(form.email, form.username, form.password);
      } else {
        await login(form.email, form.password);
      }
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <div>
          <p className="eyebrow">OnlyTogether</p>
          <h1>{isRegister ? 'Регистрация' : 'Вход'}</h1>
          <p className="muted">
            {isRegister ? 'Создайте аккаунт для приватных комнат.' : 'Вернитесь к своим комнатам просмотра.'}
          </p>
        </div>

        <form onSubmit={submit} className="stack">
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => update('email', event.target.value)}
              required
            />
          </label>

          {isRegister && (
            <label>
              Имя
              <input
                value={form.username}
                onChange={(event) => update('username', event.target.value)}
                required
                minLength={2}
              />
            </label>
          )}

          <label>
            Пароль
            <input
              type="password"
              value={form.password}
              onChange={(event) => update('password', event.target.value)}
              required
              minLength={isRegister ? 8 : 1}
            />
          </label>

          {error && <p className="error-text">{error}</p>}

          <button className="button primary" type="submit" disabled={submitting}>
            {isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}
            {isRegister ? 'Создать аккаунт' : 'Войти'}
          </button>
        </form>

        <p className="muted">
          {isRegister ? 'Уже есть аккаунт?' : 'Нет аккаунта?'}{' '}
          <Link to={isRegister ? '/login' : '/register'}>
            {isRegister ? 'Войти' : 'Зарегистрироваться'}
          </Link>
        </p>
      </section>
    </main>
  );
}
