import { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function AdminDashboard() {
  const [companies, setCompanies] = useState([]);
  const [companyProducts, setCompanyProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [viewMode, setViewMode] = useState('companies'); // 'companies' | 'products'
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [editingCompany, setEditingCompany] = useState(null);
  const [companyForm, setCompanyForm] = useState({ companyName: '', businessNumber: '', representative: '', phone: '', email: '' });

  async function fetchAll() {
    try {
      const [companiesSnap, cpSnap, productsSnap, requestsSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'companyProducts')),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'companyRequests'))
      ]);
      setCompanies(companiesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCompanyProducts(cpSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProducts(productsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setRequests(
        requestsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const aTime = a.createdAt?.toMillis?.() || 0;
            const bTime = b.createdAt?.toMillis?.() || 0;
            return bTime - aTime;
          })
      );
    } catch (error) {
      console.error('데이터 로딩 실패:', error);
    }
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  async function handleRequestReview(id) {
    try {
      await updateDoc(doc(db, 'companyRequests', id), { status: 'reviewed' });
      fetchAll();
    } catch (error) {
      console.error('상태 업데이트 실패:', error);
    }
  }

  async function handleRequestDelete(id) {
    if (!confirm('이 요청을 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'companyRequests', id));
      fetchAll();
    } catch (error) {
      console.error('삭제 실패:', error);
    }
  }

  function handleCompanyEdit(company) {
    setCompanyForm({
      companyName: company.companyName || '',
      businessNumber: company.businessNumber || '',
      representative: company.representative || '',
      phone: company.phone || '',
      email: company.email || ''
    });
    setEditingCompany(company);
    setSelectedCompany(null);
  }

  async function handleCompanyUpdate(e) {
    e.preventDefault();
    if (!editingCompany) return;
    try {
      await updateDoc(doc(db, 'companies', editingCompany.id), {
        companyName: companyForm.companyName,
        businessNumber: companyForm.businessNumber,
        representative: companyForm.representative,
        phone: companyForm.phone,
        email: companyForm.email
      });
      setEditingCompany(null);
      fetchAll();
    } catch (error) {
      console.error('업체 수정 실패:', error);
      alert('수정 중 오류가 발생했습니다.');
    }
  }

  async function handleCompanyDelete(company) {
    if (!confirm(`"${company.companyName}" 업체를 삭제하시겠습니까?\n해당 업체의 납품 등록 정보도 함께 삭제됩니다.`)) return;
    try {
      const relatedProducts = companyProducts.filter(cp => cp.companyId === company.id);
      for (const cp of relatedProducts) {
        await deleteDoc(doc(db, 'companyProducts', cp.id));
      }
      await deleteDoc(doc(db, 'companies', company.id));
      if (selectedCompany?.id === company.id) setSelectedCompany(null);
      if (editingCompany?.id === company.id) setEditingCompany(null);
      fetchAll();
    } catch (error) {
      console.error('업체 삭제 실패:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  }

  function getCompanyProducts(companyId) {
    return companyProducts.filter(cp => cp.companyId === companyId);
  }

  function getProductSuppliers(productId) {
    return companyProducts.filter(cp => cp.productId === productId);
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setViewMode('companies'); setSelectedCompany(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              viewMode === 'companies' ? 'bg-primary text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            업체별 보기
          </button>
          <button
            onClick={() => { setViewMode('products'); setSelectedCompany(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              viewMode === 'products' ? 'bg-primary text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            제품별 보기
          </button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <p className="text-sm text-gray-500">등록 업체 수</p>
          <p className="text-3xl font-bold text-gray-900">{companies.length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <p className="text-sm text-gray-500">등록 제품 수</p>
          <p className="text-3xl font-bold text-gray-900">{products.length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <p className="text-sm text-gray-500">납품 등록 건수</p>
          <p className="text-3xl font-bold text-gray-900">{companyProducts.length}</p>
        </div>
        <div className={`bg-white rounded-xl p-5 border ${requests.filter(r => r.status === 'pending').length > 0 ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
          <p className="text-sm text-gray-500">업체 요청</p>
          <p className="text-3xl font-bold text-gray-900">
            {requests.filter(r => r.status === 'pending').length}
            <span className="text-sm font-normal text-gray-400 ml-1">/ {requests.length}</span>
          </p>
        </div>
      </div>

      {/* 업체 수출 희망 요청 */}
      {requests.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">업체 수출 희망 요청</h2>
          <div className="space-y-3">
            {requests.map(req => (
              <div
                key={req.id}
                className={`bg-white rounded-xl p-5 border ${
                  req.status === 'pending' ? 'border-orange-300' : 'border-gray-200 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-900">{req.companyName}</span>
                      <span className="text-xs text-gray-400">{req.email}</span>
                      {req.status === 'pending' ? (
                        <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium">
                          검토 대기
                        </span>
                      ) : (
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
                          검토 완료
                        </span>
                      )}
                      {req.createdAt?.toDate && (
                        <span className="text-xs text-gray-400">
                          {req.createdAt.toDate().toLocaleDateString('ko-KR')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-line bg-gray-50 rounded-lg p-3">
                      {req.requestText}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {req.status === 'pending' && (
                      <button
                        onClick={() => handleRequestReview(req.id)}
                        className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 transition"
                      >
                        검토 완료
                      </button>
                    )}
                    <button
                      onClick={() => handleRequestDelete(req.id)}
                      className="text-red-500 hover:text-red-700 text-xs hover:underline"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'companies' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">등록 업체 목록</h2>
          {companies.length === 0 ? (
            <p className="text-gray-400 text-center py-8">등록된 업체가 없습니다.</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">회사명</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">사업자번호</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">대표자</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">연락처</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">이메일</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">사업자등록증</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">납품 제품</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {companies.map(company => (
                    <tr
                      key={company.id}
                      className={`hover:bg-gray-50 cursor-pointer ${
                        selectedCompany?.id === company.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => setSelectedCompany(selectedCompany?.id === company.id ? null : company)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{company.companyName}</td>
                      <td className="px-4 py-3 text-gray-500">{company.businessNumber}</td>
                      <td className="px-4 py-3 text-gray-500">{company.representative}</td>
                      <td className="px-4 py-3 text-gray-500">{company.phone}</td>
                      <td className="px-4 py-3 text-gray-500">{company.email}</td>
                      <td className="px-4 py-3 text-center">
                        {company.businessLicenseUrl ? (
                          <a
                            href={company.businessLicenseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-primary hover:underline text-xs font-medium"
                          >
                            보기
                          </a>
                        ) : (
                          <span className="text-gray-300 text-xs">없음</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-primary-light text-primary text-xs font-medium px-2 py-1 rounded-full">
                          {getCompanyProducts(company.id).length}건
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={e => { e.stopPropagation(); handleCompanyEdit(company); }}
                          className="text-primary hover:underline mr-3 text-xs"
                        >
                          수정
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleCompanyDelete(company); }}
                          className="text-red-500 hover:underline text-xs"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editingCompany && (
            <form onSubmit={handleCompanyUpdate} className="bg-white rounded-xl p-5 border border-primary mb-4 space-y-3">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-gray-900">업체 정보 수정</h3>
                <button type="button" onClick={() => setEditingCompany(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">회사명 *</label>
                  <input
                    type="text"
                    value={companyForm.companyName}
                    onChange={e => setCompanyForm(prev => ({ ...prev, companyName: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">사업자번호</label>
                  <input
                    type="text"
                    value={companyForm.businessNumber}
                    onChange={e => setCompanyForm(prev => ({ ...prev, businessNumber: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">대표자명</label>
                  <input
                    type="text"
                    value={companyForm.representative}
                    onChange={e => setCompanyForm(prev => ({ ...prev, representative: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">연락처</label>
                  <input
                    type="text"
                    value={companyForm.phone}
                    onChange={e => setCompanyForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">이메일</label>
                  <input
                    type="text"
                    value={companyForm.email}
                    onChange={e => setCompanyForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition">
                  수정 저장
                </button>
                <button type="button" onClick={() => setEditingCompany(null)} className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                  취소
                </button>
              </div>
            </form>
          )}

          {selectedCompany && (
            <div className="bg-white rounded-xl p-5 border border-primary">
              <h3 className="font-semibold text-gray-900 mb-3">
                {selectedCompany.companyName}
              </h3>
              <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4 pb-4 border-b border-gray-100">
                <span>대표: {selectedCompany.representative}</span>
                <span>사업자번호: {selectedCompany.businessNumber}</span>
                <span>연락처: {selectedCompany.phone}</span>
                <span>이메일: {selectedCompany.email}</span>
                {selectedCompany.businessLicenseUrl && (
                  <a
                    href={selectedCompany.businessLicenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-medium hover:underline"
                  >
                    사업자등록증 보기
                  </a>
                )}
              </div>
              <h4 className="font-medium text-gray-800 mb-3">납품 가능 제품</h4>
              {getCompanyProducts(selectedCompany.id).length === 0 ? (
                <p className="text-gray-400 text-sm">등록된 납품 제품이 없습니다.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">제품명</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">MOQ</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">카툰 입수량</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">도매가(원)</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">납품 기간</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {getCompanyProducts(selectedCompany.id).map(cp => (
                      <tr key={cp.id}>
                        <td className="px-4 py-2 font-medium text-gray-900">{cp.productName}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{cp.moq?.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{cp.cartonQuantity?.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{cp.wholesalePrice?.toLocaleString()}원</td>
                        <td className="px-4 py-2 text-gray-700">{cp.deliveryPeriod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {viewMode === 'products' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">제품별 납품 업체 비교</h2>
          {products.map(product => {
            const suppliers = getProductSuppliers(product.id);
            if (suppliers.length === 0) return null;
            return (
              <div key={product.id} className="bg-white rounded-xl p-5 border border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-blue-50 text-blue-600 text-xs font-medium px-2 py-0.5 rounded">
                    {product.category}
                  </span>
                  <h3 className="font-semibold text-gray-900">{product.name}</h3>
                  <span className="text-gray-400 text-xs">({suppliers.length}개 업체)</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">업체명</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">MOQ</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">카툰 입수량</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">도매가(원)</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">납품 기간</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {suppliers
                      .sort((a, b) => (a.wholesalePrice || 0) - (b.wholesalePrice || 0))
                      .map(cp => (
                        <tr key={cp.id}>
                          <td className="px-4 py-2 font-medium text-gray-900">{cp.companyName}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{cp.moq?.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{cp.cartonQuantity?.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{cp.wholesalePrice?.toLocaleString()}원</td>
                          <td className="px-4 py-2 text-gray-700">{cp.deliveryPeriod}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
