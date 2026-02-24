import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export default function Layout({ children }) {
  const { currentUser, logout } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  const langToggle = (
    <div className="flex items-center bg-surface-dark rounded-lg border border-border overflow-hidden text-xs">
      <button
        onClick={() => setLang('ko')}
        className={`px-2.5 py-1.5 font-medium transition ${lang === 'ko' ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-200'}`}
      >
        KR
      </button>
      <button
        onClick={() => setLang('en')}
        className={`px-2.5 py-1.5 font-medium transition ${lang === 'en' ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-200'}`}
      >
        EN
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-dark font-sans">
      <nav className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link to="/" className="flex items-center gap-3" onClick={closeMenu}>
              <img src="/hibos-logo.png" alt="HIBOS" className="h-9 w-9 rounded-lg" />
              <span className="text-xl font-bold text-white">HIBOS</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-4">
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
                    {t('nav.exportInfo')}
                  </Link>
                  <Link to="/register" className="text-gray-400 hover:text-primary text-sm font-medium transition">
                    {t('nav.companyRegister')}
                  </Link>
                  <Link to="/products" className="text-gray-400 hover:text-primary text-sm font-medium transition">
                    {t('nav.productRegister')}
                  </Link>
                  {!isAdmin && langToggle}
                  <Link
                    to="/admin/login"
                    className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition"
                  >
                    {t('nav.admin')}
                  </Link>
                </>
              )}
            </div>

            {/* Mobile: lang toggle + hamburger */}
            <div className="flex items-center gap-3 md:hidden">
              {!isAdmin && langToggle}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="text-gray-400 hover:text-white p-1"
                aria-label="Menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {menuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-border bg-surface">
            <div className="px-4 py-3 space-y-2">
              {isAdmin && currentUser ? (
                <>
                  <Link to="/admin" onClick={closeMenu} className="block py-2 text-gray-300 hover:text-primary text-sm font-medium">
                    대시보드
                  </Link>
                  <Link to="/admin/products" onClick={closeMenu} className="block py-2 text-gray-300 hover:text-primary text-sm font-medium">
                    제품 관리
                  </Link>
                  <Link to="/admin/orders" onClick={closeMenu} className="block py-2 text-gray-300 hover:text-primary text-sm font-medium">
                    주문 발송
                  </Link>
                  <button
                    onClick={() => { logout(); closeMenu(); }}
                    className="w-full text-left py-2 text-gray-300 hover:text-red-400 text-sm font-medium"
                  >
                    로그아웃
                  </button>
                </>
              ) : (
                <>
                  <Link to="/" onClick={closeMenu} className="block py-2 text-gray-300 hover:text-primary text-sm font-medium">
                    {t('nav.exportInfo')}
                  </Link>
                  <Link to="/register" onClick={closeMenu} className="block py-2 text-gray-300 hover:text-primary text-sm font-medium">
                    {t('nav.companyRegister')}
                  </Link>
                  <Link to="/products" onClick={closeMenu} className="block py-2 text-gray-300 hover:text-primary text-sm font-medium">
                    {t('nav.productRegister')}
                  </Link>
                  <Link
                    to="/admin/login"
                    onClick={closeMenu}
                    className="block py-2 text-primary hover:text-primary-dark text-sm font-medium"
                  >
                    {t('nav.admin')}
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
