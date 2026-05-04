import { ArrowRight, Clapperboard, MessageCircle, PlayCircle, ShieldCheck, Users, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';

const features = [
  {
    icon: PlayCircle,
    title: 'Синхронный плеер',
    text: 'Один старт, пауза и перемотка для всей комнаты.'
  },
  {
    icon: MessageCircle,
    title: 'Чат рядом с видео',
    text: 'Обсуждение не теряется в отдельных мессенджерах.'
  },
  {
    icon: ShieldCheck,
    title: 'Invite-доступ',
    text: 'Комнаты открываются только по ссылке или коду.'
  }
];

export default function HomePage() {
  const { isAuthenticated, loading } = useAuth();
  const primaryTarget = isAuthenticated ? '/dashboard' : '/register';
  const primaryText = isAuthenticated ? 'Открыть комнаты' : 'Начать вместе';

  return (
    <main className="home-page">
      <nav className="home-nav" aria-label="Основная навигация">
        <Link className="brand-mark" to="/">
          <Clapperboard size={22} />
          <span>OnlyTogether</span>
        </Link>
        <div className="home-nav-actions">
          <Link className="button compact ghost" to="/login">
            Войти
          </Link>
          <Link className="button compact primary" to={primaryTarget}>
            {loading ? 'Загрузка...' : primaryText}
          </Link>
        </div>
      </nav>

      <section className="home-hero">
        <div className="home-copy">
          <p className="eyebrow">Совместный просмотр без суеты</p>
          <h1>OnlyTogether</h1>
          <p className="home-lead">
            Соберите друзей в приватной комнате, включите видео и смотрите его в одном ритме с
            чатом, invite-ссылками и синхронизацией управления.
          </p>
          <div className="hero-actions">
            <Link className="button primary large" to={primaryTarget}>
              {primaryText}
              <ArrowRight size={18} />
            </Link>
            <Link className="button large subtle" to="/login">
              У меня есть аккаунт
            </Link>
          </div>
          <div className="home-stats" aria-label="Преимущества OnlyTogether">
            <span>
              <strong>Live</strong>
              синхронизация
            </span>
            <span>
              <strong>Invite</strong>
              комнаты
            </span>
            <span>
              <strong>Chat</strong>
              рядом
            </span>
          </div>
        </div>

        <div className="home-preview" aria-label="Превью комнаты OnlyTogether">
          <div className="preview-topline">
            <span className="preview-dot red" />
            <span className="preview-dot amber" />
            <span className="preview-dot green" />
            <span className="preview-title">Friday Room</span>
          </div>
          <div className="preview-stage">
            <div className="preview-video">
              <div className="preview-play">
                <PlayCircle size={44} />
              </div>
              <div className="preview-caption">
                <span>04:18</span>
                <span>Все на одном кадре</span>
              </div>
            </div>
            <div className="preview-chat">
              <div className="preview-chat-header">
                <Users size={16} />
                <span>4 онлайн</span>
              </div>
              <p>
                <strong>anna</strong>
                Ставь на паузу, я беру чай
              </p>
              <p>
                <strong>max</strong>
                Вернулся, можно продолжать
              </p>
              <p className="preview-system">
                <Zap size={14} />
                Видео синхронизировано
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="home-features" aria-label="Возможности">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <article className="feature-item" key={feature.title}>
              <Icon size={22} />
              <h2>{feature.title}</h2>
              <p>{feature.text}</p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
