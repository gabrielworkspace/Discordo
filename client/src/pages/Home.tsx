import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import { LogOut, Plus, LogIn } from 'lucide-react';

export default function Home() {
  const { user, logout } = useContext(AuthContext);
  const [roomCode, setRoomCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();

      const { data, error } = await supabase
        .from('rooms')
        .insert([{ code, name: roomName || null, created_by: user?.id }])
        .select()
        .single();

      if (error) throw new Error(error.message);

      navigate(`/room/${data.code}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim()) {
      navigate(`/room/${roomCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="app-container">
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: '20px', borderBottom: '1px solid var(--color-bg-elevated)' }}>
        <h1 style={{ color: 'var(--color-primary)', margin: 0 }}>Discordo</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span>Olá, <strong>{user?.displayName}</strong></span>
          <button onClick={handleLogout} className="secondary" style={{ padding: '8px 16px' }}>
            <LogOut size={16} /> Sair
          </button>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', gap: '40px' }}>
        
        <div className="card" style={{ maxWidth: '500px' }}>
          <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={24} color="var(--color-primary)"/> Criar Sala
          </h2>
          <form onSubmit={createRoom}>
            <div className="form-group">
              <label>Nome da Sala (opcional)</label>
              <input 
                type="text" 
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Ex: Reunião de Projeto"
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="primary" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>
              Criar e Entrar
            </button>
          </form>
        </div>

        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>OU</div>

        <div className="card" style={{ maxWidth: '500px' }}>
          <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LogIn size={24} color="var(--color-primary)"/> Entrar com Código
          </h2>
          <form onSubmit={joinRoom}>
            <div className="form-group">
              <label>Código da Sala ou Link</label>
              <input 
                type="text" 
                value={roomCode}
                onChange={(e) => {
                  let val = e.target.value;
                  if (val.includes('/room/')) {
                    val = val.split('/room/')[1];
                  }
                  setRoomCode(val.toUpperCase());
                }}
                placeholder="ABC123"
                required
              />
            </div>
            <button type="submit" className="secondary" style={{ width: '100%', marginTop: '8px' }}>
              Entrar na Sala
            </button>
          </form>
        </div>

      </main>
    </div>
  );
}
