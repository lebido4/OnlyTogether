import { Send } from 'lucide-react';
import { useMemo, useState } from 'react';

export default function ChatPanel({ messages, onSend, disabled }) {
  const [text, setText] = useState('');
  const sorted = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [messages]
  );

  function submit(event) {
    event.preventDefault();
    const value = text.trim();
    if (!value) {
      return;
    }
    onSend(value);
    setText('');
  }

  return (
    <aside className="chat-panel">
      <div className="panel-header">
        <h2>Чат</h2>
        <span>{sorted.length}</span>
      </div>

      <div className="messages">
        {sorted.map((message) => (
          <article className={`message message-${message.type}`} key={message.id}>
            {message.type === 'user' && (
              <strong>{message.user?.username ?? 'Пользователь'}</strong>
            )}
            <p>{message.content}</p>
            <time>{new Date(message.createdAt).toLocaleTimeString()}</time>
          </article>
        ))}
      </div>

      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Сообщение"
          disabled={disabled}
          maxLength={2000}
        />
        <button className="icon-button primary" type="submit" disabled={disabled} title="Отправить">
          <Send size={18} />
        </button>
      </form>
    </aside>
  );
}
