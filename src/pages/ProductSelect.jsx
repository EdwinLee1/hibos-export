import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, where, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useLocation, useNavigate } from 'react-router-dom';

export default function ProductSelect() {
  const location = useLocation();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState({});
  const [companyInfo, setCompanyInfo] = useState(location.state || null);
  const [verifyForm, setVerifyForm] = useState({ email: '', businessNumber: '' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [requestText, setRequestText] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  useEffect(() => {
    async function fetchProducts() {
      try {
        const snap = await getDocs(collection(db, 'products'));
        setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error('제품 로딩 실패:', error);
      }
      setLoading(false);
    }
    fetchProducts();
  }, []);

  async function handleVerify(e) {
    e.preventDefault();
    try {
      const q = query(
        collection(db, 'companies'),
        where('email', '==', verifyForm.email),
        where('businessNumber', '==', verifyForm.businessNumber)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        alert('등록된 업체 정보를 찾을 수 없습니다. 이메일과 사업자번호를 확인해주세요.');
        return;
      }
      const companyDoc = snap.docs[0];
      setCompanyInfo({
        companyId: companyDoc.id,
        companyName: companyDoc.data().companyName,
        email: companyDoc.data().email,
        businessNumber: companyDoc.data().businessNumber
      });

      // 기존 등록 제품 로드
      const existingQ = query(
        collection(db, 'companyProducts'),
        where('companyId', '==', companyDoc.id)
      );
      const existingSnap = await getDocs(existingQ);
      const existing = {};
      existingSnap.docs.forEach(d => {
        const data = d.data();
        existing[data.productId] = {
          docId: d.id,
          moq: data.moq || '',
          cartonQuantity: data.cartonQuantity || '',
          wholesalePrice: data.wholesalePrice || '',
          deliveryPeriod: data.deliveryPeriod || ''
        };
      });
      setSelectedProducts(existing);
    } catch (error) {
      console.error('인증 실패:', error);
      alert('오류가 발생했습니다.');
    }
  }

  function toggleProduct(productId) {
    setSelectedProducts(prev => {
      if (prev[productId]) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: { moq: '', cartonQuantity: '', wholesalePrice: '', deliveryPeriod: '' } };
    });
  }

  function updateProductInfo(productId, field, value) {
    setSelectedProducts(prev => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: value }
    }));
  }

  async function handleRequestSubmit() {
    if (!requestText.trim()) {
      alert('수출 희망 품목을 입력해주세요.');
      return;
    }
    setRequestSubmitting(true);
    try {
      await addDoc(collection(db, 'companyRequests'), {
        companyId: companyInfo.companyId,
        companyName: companyInfo.companyName,
        email: companyInfo.email,
        requestText: requestText.trim(),
        status: 'pending',
        createdAt: serverTimestamp()
      });
      alert('수출 희망 품목이 전달되었습니다. 관리자 검토 후 제품 목록에 반영됩니다.');
      setRequestText('');
    } catch (error) {
      console.error('요청 저장 실패:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
    setRequestSubmitting(false);
  }

  async function handleSubmit() {
    // 검증
    for (const [productId, info] of Object.entries(selectedProducts)) {
      if (!info.moq || !info.cartonQuantity || !info.wholesalePrice || !info.deliveryPeriod) {
        const product = products.find(p => p.id === productId);
        alert(`"${product?.name}" 제품의 모든 항목을 입력해주세요.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      // 기존 데이터 삭제
      const existingQ = query(
        collection(db, 'companyProducts'),
        where('companyId', '==', companyInfo.companyId)
      );
      const existingSnap = await getDocs(existingQ);
      for (const d of existingSnap.docs) {
        await deleteDoc(doc(db, 'companyProducts', d.id));
      }

      // 새 데이터 저장
      for (const [productId, info] of Object.entries(selectedProducts)) {
        const product = products.find(p => p.id === productId);
        await addDoc(collection(db, 'companyProducts'), {
          companyId: companyInfo.companyId,
          companyName: companyInfo.companyName,
          productId,
          productName: product?.name || '',
          moq: Number(info.moq),
          cartonQuantity: Number(info.cartonQuantity),
          wholesalePrice: Number(info.wholesalePrice),
          deliveryPeriod: info.deliveryPeriod,
          createdAt: serverTimestamp()
        });
      }
      setSuccess(true);
    } catch (error) {
      console.error('저장 실패:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4">&#10003;</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">납품 정보 저장 완료!</h2>
        <p className="text-gray-500 mb-6">관리자가 확인 후 연락드리겠습니다.</p>
        <button
          onClick={() => navigate('/')}
          className="bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-dark transition"
        >
          메인으로 돌아가기
        </button>
      </div>
    );
  }

  // 업체 인증 전
  if (!companyInfo) {
    return (
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">납품 제품 등록</h1>
          <p className="text-gray-500">등록된 업체 정보로 본인 확인을 해주세요</p>
        </div>
        <form onSubmit={handleVerify} className="bg-white rounded-xl p-6 border border-gray-200 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
            <input
              type="email"
              value={verifyForm.email}
              onChange={e => setVerifyForm(prev => ({ ...prev, email: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="등록 시 입력한 이메일"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">사업자번호</label>
            <input
              type="text"
              value={verifyForm.businessNumber}
              onChange={e => setVerifyForm(prev => ({ ...prev, businessNumber: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="000-00-00000"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-primary text-white py-3 rounded-lg font-medium hover:bg-primary-dark transition"
          >
            본인 확인
          </button>
          <p className="text-center text-sm text-gray-400">
            업체 등록이 아직 안 되셨나요?{' '}
            <button type="button" onClick={() => navigate('/register')} className="text-primary hover:underline">
              업체 등록하기
            </button>
          </p>
        </form>
      </div>
    );
  }

  // 업체 인증 후 - 제품 선택
  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">납품 가능 제품 선택</h1>
        <p className="text-gray-500">
          <span className="font-medium text-primary">{companyInfo.companyName}</span>에서 납품 가능한 제품을 선택하고 정보를 입력해주세요
        </p>
      </div>

      {products.length === 0 ? (
        <p className="text-gray-400 text-center py-8">등록된 제품이 없습니다.</p>
      ) : (
        <div className="space-y-4">
          {products.map(product => {
            const isSelected = !!selectedProducts[product.id];
            return (
              <div
                key={product.id}
                className={`bg-white rounded-xl p-5 border transition ${
                  isSelected ? 'border-primary shadow-sm' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleProduct(product.id)}
                    className="mt-1 h-5 w-5 text-primary rounded border-gray-300 focus:ring-primary"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-blue-50 text-blue-600 text-xs font-medium px-2 py-0.5 rounded">
                        {product.category}
                      </span>
                      <h3 className="font-semibold text-gray-900">{product.name}</h3>
                    </div>
                    <p className="text-sm text-gray-500">{product.description}</p>
                  </div>
                </div>

                {isSelected && (
                  <div className="mt-4 ml-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">MOQ (최소주문수량)</label>
                      <input
                        type="number"
                        value={selectedProducts[product.id]?.moq || ''}
                        onChange={e => updateProductInfo(product.id, 'moq', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="예: 1000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">카툰박스 입수량</label>
                      <input
                        type="number"
                        value={selectedProducts[product.id]?.cartonQuantity || ''}
                        onChange={e => updateProductInfo(product.id, 'cartonQuantity', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="예: 50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">도매가 (원)</label>
                      <input
                        type="number"
                        value={selectedProducts[product.id]?.wholesalePrice || ''}
                        onChange={e => updateProductInfo(product.id, 'wholesalePrice', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="예: 5000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">납품 가능 기간</label>
                      <input
                        type="text"
                        value={selectedProducts[product.id]?.deliveryPeriod || ''}
                        onChange={e => updateProductInfo(product.id, 'deliveryPeriod', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="예: 2주"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="text-center pt-4">
            <button
              onClick={handleSubmit}
              disabled={submitting || Object.keys(selectedProducts).length === 0}
              className="bg-primary text-white px-8 py-3 rounded-lg font-medium hover:bg-primary-dark transition disabled:opacity-50"
            >
              {submitting ? '저장 중...' : `선택한 ${Object.keys(selectedProducts).length}개 제품 저장`}
            </button>
          </div>
        </div>
      )}

      {/* 수출 희망 품목 직접 입력 */}
      {companyInfo && (
        <div className="mt-8 bg-white rounded-xl p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">수출 희망 품목 직접 입력</h2>
          <p className="text-sm text-gray-500 mb-4">
            위 목록에 없는 제품이 있다면, 수출하고 싶은 품목을 자유롭게 입력해주세요. 관리자 검토 후 제품 목록에 반영됩니다.
          </p>
          <textarea
            value={requestText}
            onChange={e => setRequestText(e.target.value)}
            rows={5}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent mb-3"
            placeholder="예: 마스크팩, 세럼, 선크림 수출 희망합니다. 자체 브랜드 히알루론산 세럼(30ml, 50ml)도 납품 가능합니다."
          />
          <button
            onClick={handleRequestSubmit}
            disabled={requestSubmitting || !requestText.trim()}
            className="bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
          >
            {requestSubmitting ? '전송 중...' : '희망 품목 전달하기'}
          </button>
        </div>
      )}
    </div>
  );
}
