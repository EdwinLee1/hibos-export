import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import CompanyRegister from './pages/CompanyRegister';
import ProductSelect from './pages/ProductSelect';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminProducts from './pages/AdminProducts';
import AdminOrders from './pages/AdminOrders';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
        <Layout>
          <Routes>
            {/* 공개 페이지 */}
            <Route path="/" element={<Home />} />
            <Route path="/register" element={<CompanyRegister />} />
            <Route path="/products" element={<ProductSelect />} />

            {/* 관리자 페이지 */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/products" element={<ProtectedRoute><AdminProducts /></ProtectedRoute>} />
            <Route path="/admin/orders" element={<ProtectedRoute><AdminOrders /></ProtectedRoute>} />
          </Routes>
        </Layout>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
