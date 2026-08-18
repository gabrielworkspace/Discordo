import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabase';
import { UserPlus } from 'lucide-react';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            displayName
          }
        }
      });
      
      if (error) {
        throw new Error(error.message);
      }

      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="center-content">
      <div className="card">
        <h2 className="card-title" style={{ color: 'var(--color-primary)' }}>Discordo</h2>
        <p style={{ textAlign: 'center', marginBottom: '24px', color: 'var(--color-text-muted)' }}>Crie sua conta</p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nome de Exibição</label>
            <input 
              type="text" 
              required 
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex: João Silva"
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input 
              type="email" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
          </div>
          
          <div className="form-group">
            <label>Senha</label>
            <input 
              type="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="primary" style={{ width: '100%', marginTop: '16px' }} disabled={loading}>
            <UserPlus size={20} />
            {loading ? 'Cadastrando...' : 'Cadastrar'}
          </button>
        </form>
        
        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.875rem' }}>
          Já tem conta? <Link to="/login">Entre aqui</Link>
        </p>
      </div>
    </div>
  );
}
