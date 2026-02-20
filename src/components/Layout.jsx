import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout({ children }) {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  return (
    <div className="min-h-screen bg-surface-dark font-sans">
      <nav className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link to="/" className="flex items-center gap-3">
              <img src="/hibos-logo.png" alt="HIBOS" className="h-9 w-9 rounded-lg" />
              <span className="text-xl font-bold text-white">HIBOS</span>
            </Link>
            <div className="flex items-center gap-4">
              {isAdmin && currentUser ? (
                <>
                  <Link to="/admin" className="text-gray-400 hover:text-primary text-sm font-medium transition">
                    대시보드
                  </Link>
                  <Link to="/admin/products" className="text-gray-400 hover:text-primary text-sm font-medium transition">
                    제품 관리
                  </Link>
                  <Link to="/admin/orders" className="text-gray-400 hover:text-primary text-sm font-medium transition">
                    주문 발송
                  </Link>
                  <button
                    onClick={logout}
                    className="bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-600 transition"
                  >
                    로그아웃
                  </button>
                </>
              ) : (
                <>
                  <Link to="/" className="text-gray-400 hover:text-primary text-sm font-medium transition">
                    수출 정보
                  </Link>
                  <Link to="/register" className="text-gray-400 hover:text-primary text-sm font-medium transition">
                    업체 등록
                  </Link>
                  <Link to="/products" className="text-gray-400 hover:text-primary text-sm font-medium transition">
                    납품 등록
                  </Link>
                  <Link
                    to="/admin/login"
                    className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition"
                  >
                    관리자
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
