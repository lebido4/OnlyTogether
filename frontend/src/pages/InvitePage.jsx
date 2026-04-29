import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, getApiError } from '../api.js';

export default function InvitePage() {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    async function join() {
      try {
        const response = await api.post(`/rooms/invite/${inviteCode}/join`);
        navigate(`/rooms/${response.data.room.id}`, { replace: true });
      } catch (requestError) {
        setError(getApiError(requestError));
      }
    }

    join();
  }, [inviteCode, navigate]);

  return (
    <main className="screen-center">
      <section className="panel">
        <h1>Подключение к комнате</h1>
        {error ? <p className="error-text">{error}</p> : <p className="muted">Открываем комнату...</p>}
      </section>
    </main>
  );
}
