import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/admin');
    } catch (err) {
      console.error('로그인 에러:', err.code, err.message);
      setError(`로그인 실패: ${err.code} - ${err.message}`);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <div className="text-center mb-8">
        <img src="/hibos-logo.png" alt="HIBOS" className="h-16 w-16 rounded-xl mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-100 mb-2">관리자 로그인</h1>
        <p className="text-gray-400 text-sm">관리자 계정으로 로그인해주세요</p>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl p-6 border border-border space-y-4">
        {error && <div className="bg-red-500/15 text-red-400 text-sm p-3 rounded-lg">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">이메일</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder-gray-500" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">비밀번호</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder-gray-500" required />
        </div>
        <button type="submit" disabled={loading}
          className="w-full bg-primary text-white py-3 rounded-lg font-medium hover:bg-primary-dark transition disabled:opacity-50">
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  );
}
