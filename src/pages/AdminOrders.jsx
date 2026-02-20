import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function AdminOrders() {
  const [companies, setCompanies] = useState([]);
  const [companyProducts, setCompanyProducts] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [orderItems, setOrderItems] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [companiesSnap, cpSnap] = await Promise.all([getDocs(collection(db, 'companies')), getDocs(collection(db, 'companyProducts'))]);
        setCompanies(companiesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setCompanyProducts(cpSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) { console.error('데이터 로딩 실패:', error); }
      setLoading(false);
    }
    fetchData();
  }, []);

  const selectedCompanyData = companies.find(c => c.id === selectedCompany);
  const availableProducts = companyProducts.filter(cp => cp.companyId === selectedCompany);

  function handleCompanyChange(companyId) { setSelectedCompany(companyId); setOrderItems([]); setShowPreview(false); }
  function addOrderItem(cp) { if (orderItems.find(item => item.productId === cp.productId)) return; setOrderItems(prev => [...prev, { productId: cp.productId, productName: cp.productName, wholesalePrice: cp.wholesalePrice, moq: cp.moq, quantity: cp.moq || 0 }]); }
  function removeOrderItem(productId) { setOrderItems(prev => prev.filter(item => item.productId !== productId)); }
  function updateQuantity(productId, quantity) { setOrderItems(prev => prev.map(item => item.productId === productId ? { ...item, quantity: Number(quantity) } : item)); }
  function getTotalAmount() { return orderItems.reduce((sum, item) => sum + (item.wholesalePrice * item.quantity), 0); }

  function getEmailContent() {
    const company = selectedCompanyData;
    const items = orderItems.map(item => `- ${item.productName}: ${item.quantity.toLocaleString()}개 x ${item.wholesalePrice.toLocaleString()}원 = ${(item.quantity * item.wholesalePrice).toLocaleString()}원`).join('\n');
    return `${company.companyName} 담당자님께,\n\n아래와 같이 주문을 요청드립니다.\n\n[주문 내역]\n${items}\n\n총 금액: ${getTotalAmount().toLocaleString()}원\n\n확인 후 회신 부탁드립니다.\n감사합니다.`;
  }

  async function handleSendOrder() {
    if (orderItems.length === 0) { alert('주문할 제품을 선택해주세요.'); return; }
    setSending(true);
    try {
      await addDoc(collection(db, 'orders'), { companyId: selectedCompany, companyName: selectedCompanyData.companyName, companyEmail: selectedCompanyData.email, items: orderItems, totalAmount: getTotalAmount(), status: 'sent', createdAt: serverTimestamp() });
      alert(`주문이 저장되었습니다.\n이메일 발송: ${selectedCompanyData.email}`);
      setOrderItems([]); setShowPreview(false);
    } catch (error) { console.error('주문 실패:', error); alert('주문 처리 중 오류가 발생했습니다.'); }
    setSending(false);
  }

  if (loading) {
    return (<div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-100 mb-6">주문 발송</h1>

      <div className="bg-surface rounded-xl p-5 border border-border mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">업체 선택</label>
        <select value={selectedCompany} onChange={e => handleCompanyChange(e.target.value)}
          className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent">
          <option value="">업체를 선택하세요</option>
          {companies.map(company => (<option key={company.id} value={company.id}>{company.companyName} ({company.email})</option>))}
        </select>
      </div>

      {selectedCompany && (
        <>
          <div className="bg-surface rounded-xl p-5 border border-border mb-6">
            <h2 className="text-lg font-semibold text-gray-200 mb-4">납품 가능 제품</h2>
            {availableProducts.length === 0 ? (
              <p className="text-gray-500 text-sm">이 업체의 납품 가능 제품이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {availableProducts.map(cp => {
                  const isAdded = orderItems.find(item => item.productId === cp.productId);
                  return (
                    <div key={cp.id} className={`flex items-center justify-between p-3 rounded-lg border ${isAdded ? 'border-primary bg-primary-light' : 'border-border bg-surface-dark'}`}>
                      <div>
                        <span className="font-medium text-gray-100">{cp.productName}</span>
                        <span className="text-gray-400 text-sm ml-2">MOQ: {cp.moq?.toLocaleString()} | 단가: {cp.wholesalePrice?.toLocaleString()}원</span>
                      </div>
                      {isAdded ? (
                        <button onClick={() => removeOrderItem(cp.productId)} className="text-red-400 text-sm hover:underline">제거</button>
                      ) : (
                        <button onClick={() => addOrderItem(cp)} className="text-primary text-sm hover:underline">추가</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {orderItems.length > 0 && (
            <div className="bg-surface rounded-xl p-5 border border-border mb-6">
              <h2 className="text-lg font-semibold text-gray-200 mb-4">주문 내역</h2>
              <table className="w-full text-sm mb-4">
                <thead className="bg-surface-dark">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-400">제품명</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-400">단가(원)</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-400">수량</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-400">금액(원)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orderItems.map(item => (
                    <tr key={item.productId}>
                      <td className="px-4 py-2 font-medium text-gray-100">{item.productName}</td>
                      <td className="px-4 py-2 text-right text-gray-300">{item.wholesalePrice.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">
                        <input type="number" value={item.quantity} onChange={e => updateQuantity(item.productId, e.target.value)} min={1}
                          className="w-24 bg-surface-dark border border-border-light rounded px-2 py-1 text-right text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-100">{(item.wholesalePrice * item.quantity).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td colSpan={3} className="px-4 py-3 text-right font-semibold text-gray-300">총 합계</td>
                    <td className="px-4 py-3 text-right font-bold text-primary text-lg">{getTotalAmount().toLocaleString()}원</td>
                  </tr>
                </tfoot>
              </table>
              <div className="flex gap-3">
                <button onClick={() => setShowPreview(!showPreview)} className="bg-surface-light text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-border transition">
                  {showPreview ? '미리보기 닫기' : '이메일 미리보기'}
                </button>
                <button onClick={handleSendOrder} disabled={sending} className="bg-primary text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition disabled:opacity-50">
                  {sending ? '발송 중...' : '주문 발송'}
                </button>
              </div>
              {showPreview && (
                <div className="mt-4 bg-surface-dark rounded-lg p-4 border border-border">
                  <p className="text-xs text-gray-500 mb-2">수신: {selectedCompanyData.email}</p>
                  <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">{getEmailContent()}</pre>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
