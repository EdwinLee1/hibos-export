import { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function AdminDashboard() {
  const [companies, setCompanies] = useState([]);
  const [companyProducts, setCompanyProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [viewMode, setViewMode] = useState('companies');
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [editingCompany, setEditingCompany] = useState(null);
  const [companyForm, setCompanyForm] = useState({ companyName: '', businessNumber: '', representative: '', phone: '', email: '' });

  async function fetchAll() {
    try {
      const [companiesSnap, cpSnap, productsSnap, requestsSnap] = await Promise.all([
        getDocs(collection(db, 'companies')), getDocs(collection(db, 'companyProducts')),
        getDocs(collection(db, 'products')), getDocs(collection(db, 'companyRequests'))
      ]);
      setCompanies(companiesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCompanyProducts(cpSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProducts(productsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setRequests(requestsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
    } catch (error) { console.error('데이터 로딩 실패:', error); }
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  async function handleRequestReview(id) { try { await updateDoc(doc(db, 'companyRequests', id), { status: 'reviewed' }); fetchAll(); } catch (error) { console.error('상태 업데이트 실패:', error); } }
  async function handleRequestDelete(id) { if (!confirm('이 요청을 삭제하시겠습니까?')) return; try { await deleteDoc(doc(db, 'companyRequests', id)); fetchAll(); } catch (error) { console.error('삭제 실패:', error); } }

  function handleCompanyEdit(company) {
    setCompanyForm({ companyName: company.companyName || '', businessNumber: company.businessNumber || '', representative: company.representative || '', phone: company.phone || '', email: company.email || '' });
    setEditingCompany(company); setSelectedCompany(null);
  }

  async function handleCompanyUpdate(e) {
    e.preventDefault();
    if (!editingCompany) return;
    try { await updateDoc(doc(db, 'companies', editingCompany.id), companyForm); setEditingCompany(null); fetchAll(); }
    catch (error) { console.error('업체 수정 실패:', error); alert('수정 중 오류가 발생했습니다.'); }
  }

  async function handleCompanyDelete(company) {
    if (!confirm(`"${company.companyName}" 업체를 삭제하시겠습니까?\n해당 업체의 납품 등록 정보도 함께 삭제됩니다.`)) return;
    try {
      const relatedProducts = companyProducts.filter(cp => cp.companyId === company.id);
      for (const cp of relatedProducts) { await deleteDoc(doc(db, 'companyProducts', cp.id)); }
      await deleteDoc(doc(db, 'companies', company.id));
      if (selectedCompany?.id === company.id) setSelectedCompany(null);
      if (editingCompany?.id === company.id) setEditingCompany(null);
      fetchAll();
    } catch (error) { console.error('업체 삭제 실패:', error); alert('삭제 중 오류가 발생했습니다.'); }
  }

  function getCompanyProducts(companyId) { return companyProducts.filter(cp => cp.companyId === companyId); }
  function getProductSuppliers(productId) { return companyProducts.filter(cp => cp.productId === productId); }

  const inputClass = "w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder-gray-500";

  if (loading) {
    return (<div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-100">대시보드</h1>
        <div className="flex gap-2">
          <button onClick={() => { setViewMode('companies'); setSelectedCompany(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${viewMode === 'companies' ? 'bg-primary text-white' : 'bg-surface text-gray-400 border border-border'}`}>
            업체별 보기
          </button>
          <button onClick={() => { setViewMode('products'); setSelectedCompany(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${viewMode === 'products' ? 'bg-primary text-white' : 'bg-surface text-gray-400 border border-border'}`}>
            제품별 보기
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: '등록 업체 수', value: companies.length },
          { label: '등록 제품 수', value: products.length },
          { label: '납품 등록 건수', value: companyProducts.length },
        ].map(stat => (
          <div key={stat.label} className="bg-surface rounded-xl p-5 border border-border">
            <p className="text-sm text-gray-400">{stat.label}</p>
            <p className="text-3xl font-bold text-gray-100">{stat.value}</p>
          </div>
        ))}
        <div className={`bg-surface rounded-xl p-5 border ${requests.filter(r => r.status === 'pending').length > 0 ? 'border-orange-500/50' : 'border-border'}`}>
          <p className="text-sm text-gray-400">업체 요청</p>
          <p className="text-3xl font-bold text-gray-100">
            {requests.filter(r => r.status === 'pending').length}
            <span className="text-sm font-normal text-gray-500 ml-1">/ {requests.length}</span>
          </p>
        </div>
      </div>

      {requests.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-200 mb-3">업체 수출 희망 요청</h2>
          <div className="space-y-3">
            {requests.map(req => (
              <div key={req.id} className={`bg-surface rounded-xl p-5 border ${req.status === 'pending' ? 'border-orange-500/50' : 'border-border opacity-60'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-100">{req.companyName}</span>
                      <span className="text-xs text-gray-500">{req.email}</span>
                      {req.status === 'pending' ? (
                        <span className="bg-orange-500/15 text-orange-300 text-xs px-2 py-0.5 rounded-full font-medium">검토 대기</span>
                      ) : (
                        <span className="bg-green-500/15 text-green-300 text-xs px-2 py-0.5 rounded-full font-medium">검토 완료</span>
                      )}
                      {req.createdAt?.toDate && <span className="text-xs text-gray-500">{req.createdAt.toDate().toLocaleDateString('ko-KR')}</span>}
                    </div>
                    <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-dark rounded-lg p-3">{req.requestText}</p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {req.status === 'pending' && (
                      <button onClick={() => handleRequestReview(req.id)} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 transition">검토 완료</button>
                    )}
                    <button onClick={() => handleRequestDelete(req.id)} className="text-red-400 hover:text-red-300 text-xs hover:underline">삭제</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'companies' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-200">등록 업체 목록</h2>
          {companies.length === 0 ? (
            <p className="text-gray-500 text-center py-8">등록된 업체가 없습니다.</p>
          ) : (
            <div className="bg-surface rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-dark">
                  <tr>
                    {['회사명','사업자번호','대표자','연락처','이메일','사업자등록증','납품 제품','관리'].map((h, i) => (
                      <th key={h} className={`${i >= 5 ? 'text-center' : 'text-left'} ${i === 7 ? 'text-right' : ''} px-4 py-3 font-medium text-gray-400`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {companies.map(company => (
                    <tr key={company.id} className={`hover:bg-surface-light cursor-pointer transition ${selectedCompany?.id === company.id ? 'bg-primary-light' : ''}`}
                      onClick={() => setSelectedCompany(selectedCompany?.id === company.id ? null : company)}>
                      <td className="px-4 py-3 font-medium text-gray-100">{company.companyName}</td>
                      <td className="px-4 py-3 text-gray-400">{company.businessNumber}</td>
                      <td className="px-4 py-3 text-gray-400">{company.representative}</td>
                      <td className="px-4 py-3 text-gray-400">{company.phone}</td>
                      <td className="px-4 py-3 text-gray-400">{company.email}</td>
                      <td className="px-4 py-3 text-center">
                        {company.businessLicenseUrl ? (
                          <a href={company.businessLicenseUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-primary hover:underline text-xs font-medium">보기</a>
                        ) : <span className="text-gray-600 text-xs">없음</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-primary-light text-primary text-xs font-medium px-2 py-1 rounded-full">{getCompanyProducts(company.id).length}건</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={e => { e.stopPropagation(); handleCompanyEdit(company); }} className="text-primary hover:underline mr-3 text-xs">수정</button>
                        <button onClick={e => { e.stopPropagation(); handleCompanyDelete(company); }} className="text-red-400 hover:underline text-xs">삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editingCompany && (
            <form onSubmit={handleCompanyUpdate} className="bg-surface rounded-xl p-5 border border-primary mb-4 space-y-3">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-gray-100">업체 정보 수정</h3>
                <button type="button" onClick={() => setEditingCompany(null)} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { key: 'companyName', label: '회사명 *' }, { key: 'businessNumber', label: '사업자번호' },
                  { key: 'representative', label: '대표자명' }, { key: 'phone', label: '연락처' }, { key: 'email', label: '이메일' }
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-gray-400 mb-1">{f.label}</label>
                    <input type="text" value={companyForm[f.key]} onChange={e => setCompanyForm(prev => ({ ...prev, [f.key]: e.target.value }))} className={inputClass} />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition">수정 저장</button>
                <button type="button" onClick={() => setEditingCompany(null)} className="bg-surface-light text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-border transition">취소</button>
              </div>
            </form>
          )}

          {selectedCompany && (
            <div className="bg-surface rounded-xl p-5 border border-primary">
              <h3 className="font-semibold text-gray-100 mb-3">{selectedCompany.companyName}</h3>
              <div className="flex flex-wrap gap-4 text-sm text-gray-400 mb-4 pb-4 border-b border-border">
                <span>대표: {selectedCompany.representative}</span>
                <span>사업자번호: {selectedCompany.businessNumber}</span>
                <span>연락처: {selectedCompany.phone}</span>
                <span>이메일: {selectedCompany.email}</span>
                {selectedCompany.businessLicenseUrl && (
                  <a href={selectedCompany.businessLicenseUrl} target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">사업자등록증 보기</a>
                )}
              </div>
              <h4 className="font-medium text-gray-200 mb-3">납품 가능 제품</h4>
              {getCompanyProducts(selectedCompany.id).length === 0 ? (
                <p className="text-gray-500 text-sm">등록된 납품 제품이 없습니다.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-surface-dark">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-400">제품명</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-400">MOQ</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-400">카툰 입수량</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-400">도매가(원)</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-400">납품 기간</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {getCompanyProducts(selectedCompany.id).map(cp => (
                      <tr key={cp.id}>
                        <td className="px-4 py-2 font-medium text-gray-100">{cp.productName}</td>
                        <td className="px-4 py-2 text-right text-gray-300">{cp.moq?.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-gray-300">{cp.cartonQuantity?.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-gray-300">{cp.wholesalePrice?.toLocaleString()}원</td>
                        <td className="px-4 py-2 text-gray-300">{cp.deliveryPeriod}</td>
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
          <h2 className="text-lg font-semibold text-gray-200">제품별 납품 업체 비교</h2>
          {products.map(product => {
            const suppliers = getProductSuppliers(product.id);
            if (suppliers.length === 0) return null;
            return (
              <div key={product.id} className="bg-surface rounded-xl p-5 border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-purple-500/15 text-purple-300 text-xs font-medium px-2 py-0.5 rounded">{product.category}</span>
                  <h3 className="font-semibold text-gray-100">{product.name}</h3>
                  <span className="text-gray-500 text-xs">({suppliers.length}개 업체)</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-surface-dark">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-400">업체명</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-400">MOQ</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-400">카툰 입수량</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-400">도매가(원)</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-400">납품 기간</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {suppliers.sort((a, b) => (a.wholesalePrice || 0) - (b.wholesalePrice || 0)).map(cp => (
                      <tr key={cp.id}>
                        <td className="px-4 py-2 font-medium text-gray-100">{cp.companyName}</td>
                        <td className="px-4 py-2 text-right text-gray-300">{cp.moq?.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-gray-300">{cp.cartonQuantity?.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-gray-300">{cp.wholesalePrice?.toLocaleString()}원</td>
                        <td className="px-4 py-2 text-gray-300">{cp.deliveryPeriod}</td>
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
