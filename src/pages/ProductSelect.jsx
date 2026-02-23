import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, where, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
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
      } catch (error) { console.error('제품 로딩 실패:', error); }
      setLoading(false);
    }
    fetchProducts();
  }, []);

  async function handleVerify(e) {
    e.preventDefault();
    try {
      const q = query(collection(db, 'companies'), where('email', '==', verifyForm.email), where('businessNumber', '==', verifyForm.businessNumber));
      const snap = await getDocs(q);
      if (snap.empty) { alert('등록된 업체 정보를 찾을 수 없습니다. 이메일과 사업자번호를 확인해주세요.'); return; }
      const companyDoc = snap.docs[0];
      setCompanyInfo({ companyId: companyDoc.id, companyName: companyDoc.data().companyName, email: companyDoc.data().email, businessNumber: companyDoc.data().businessNumber });
      const existingQ = query(collection(db, 'companyProducts'), where('companyId', '==', companyDoc.id));
      const existingSnap = await getDocs(existingQ);
      const existing = {};
      existingSnap.docs.forEach(d => {
        const data = d.data();
        existing[data.productId] = {
          docId: d.id,
          moq: data.moq || '',
          cartonQuantity: data.cartonQuantity || '',
          wholesalePrice: data.wholesalePrice || '',
          deliveryPeriod: data.deliveryPeriod || '',
          customProductName: data.customProductName || '',
          imageFiles: [],
          imageUrls: data.productImages || [],
          imagePreviews: data.productImages || []
        };
      });
      setSelectedProducts(existing);
    } catch (error) { console.error('인증 실패:', error); alert('오류가 발생했습니다.'); }
  }

  function toggleProduct(productId) {
    setSelectedProducts(prev => {
      if (prev[productId]) { const next = { ...prev }; delete next[productId]; return next; }
      return { ...prev, [productId]: { moq: '', cartonQuantity: '', wholesalePrice: '', deliveryPeriod: '', customProductName: '', imageFiles: [], imageUrls: [], imagePreviews: [] } };
    });
  }

  function updateProductInfo(productId, field, value) {
    setSelectedProducts(prev => ({ ...prev, [productId]: { ...prev[productId], [field]: value } }));
  }

  function handleImageAdd(productId, e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setSelectedProducts(prev => {
      const current = prev[productId];
      const totalImages = (current.imageFiles?.length || 0) + (current.imageUrls?.length || 0);
      const remaining = 3 - totalImages;

      if (remaining <= 0) {
        alert('이미지는 최대 3장까지 업로드할 수 있습니다.');
        return prev;
      }

      const validFiles = files.slice(0, remaining).filter(f => {
        if (f.size > 5 * 1024 * 1024) { alert(`"${f.name}" 파일이 5MB를 초과합니다.`); return false; }
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { alert(`"${f.name}" 은(는) 지원하지 않는 형식입니다. (JPG, PNG, WEBP만 가능)`); return false; }
        return true;
      });

      const newPreviews = validFiles.map(f => URL.createObjectURL(f));

      return {
        ...prev,
        [productId]: {
          ...current,
          imageFiles: [...(current.imageFiles || []), ...validFiles],
          imagePreviews: [...(current.imagePreviews || []), ...newPreviews]
        }
      };
    });

    e.target.value = '';
  }

  function removeImage(productId, index) {
    setSelectedProducts(prev => {
      const current = prev[productId];
      const existingUrlCount = current.imageUrls?.length || 0;

      if (index < existingUrlCount) {
        const newUrls = [...current.imageUrls];
        newUrls.splice(index, 1);
        const newPreviews = [...current.imagePreviews];
        newPreviews.splice(index, 1);
        return { ...prev, [productId]: { ...current, imageUrls: newUrls, imagePreviews: newPreviews } };
      } else {
        const fileIndex = index - existingUrlCount;
        const newFiles = [...current.imageFiles];
        newFiles.splice(fileIndex, 1);
        const newPreviews = [...current.imagePreviews];
        URL.revokeObjectURL(newPreviews[index]);
        newPreviews.splice(index, 1);
        return { ...prev, [productId]: { ...current, imageFiles: newFiles, imagePreviews: newPreviews } };
      }
    });
  }

  async function uploadImages(companyId, productId, files) {
    const urls = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop();
      const storageRef = ref(storage, `product-images/${companyId}/${productId}/${Date.now()}_${i}.${ext}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      urls.push(url);
    }
    return urls;
  }

  async function handleRequestSubmit() {
    if (!requestText.trim()) { alert('수출 희망 품목을 입력해주세요.'); return; }
    setRequestSubmitting(true);
    try {
      await addDoc(collection(db, 'companyRequests'), { companyId: companyInfo.companyId, companyName: companyInfo.companyName, email: companyInfo.email, requestText: requestText.trim(), status: 'pending', createdAt: serverTimestamp() });
      alert('수출 희망 품목이 전달되었습니다. 관리자 검토 후 제품 목록에 반영됩니다.');
      setRequestText('');
    } catch (error) { console.error('요청 저장 실패:', error); alert('저장 중 오류가 발생했습니다.'); }
    setRequestSubmitting(false);
  }

  async function handleSubmit() {
    for (const [productId, info] of Object.entries(selectedProducts)) {
      if (!info.moq || !info.cartonQuantity || !info.wholesalePrice || !info.deliveryPeriod) {
        const product = products.find(p => p.id === productId);
        alert(`"${product?.name}" 제품의 필수 항목(MOQ, 입수량, 도매가, 납품기간)을 입력해주세요.`); return;
      }
    }
    setSubmitting(true);
    try {
      const existingQ = query(collection(db, 'companyProducts'), where('companyId', '==', companyInfo.companyId));
      const existingSnap = await getDocs(existingQ);
      for (const d of existingSnap.docs) { await deleteDoc(doc(db, 'companyProducts', d.id)); }

      for (const [productId, info] of Object.entries(selectedProducts)) {
        const product = products.find(p => p.id === productId);

        let allImageUrls = [...(info.imageUrls || [])];
        if (info.imageFiles && info.imageFiles.length > 0) {
          const newUrls = await uploadImages(companyInfo.companyId, productId, info.imageFiles);
          allImageUrls = [...allImageUrls, ...newUrls];
        }

        await addDoc(collection(db, 'companyProducts'), {
          companyId: companyInfo.companyId,
          companyName: companyInfo.companyName,
          productId,
          productName: product?.name || '',
          customProductName: info.customProductName || '',
          productImages: allImageUrls,
          moq: Number(info.moq),
          cartonQuantity: Number(info.cartonQuantity),
          wholesalePrice: Number(info.wholesalePrice),
          deliveryPeriod: info.deliveryPeriod,
          createdAt: serverTimestamp()
        });
      }
      setSuccess(true);
    } catch (error) { console.error('저장 실패:', error); alert('저장 중 오류가 발생했습니다.'); }
    setSubmitting(false);
  }

  const inputClass = "w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder-gray-500";

  if (loading) {
    return (<div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>);
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4 text-green-400">&#10003;</div>
        <h2 className="text-2xl font-bold text-gray-100 mb-2">납품 정보 저장 완료!</h2>
        <p className="text-gray-400 mb-6">관리자가 확인 후 연락드리겠습니다.</p>
        <button onClick={() => navigate('/')} className="bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-dark transition">메인으로 돌아가기</button>
      </div>
    );
  }

  if (!companyInfo) {
    return (
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-100 mb-2">납품 제품 등록</h1>
          <p className="text-gray-400">등록된 업체 정보로 본인 확인을 해주세요</p>
        </div>
        <form onSubmit={handleVerify} className="bg-surface rounded-xl p-6 border border-border space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">이메일</label>
            <input type="email" value={verifyForm.email} onChange={e => setVerifyForm(prev => ({ ...prev, email: e.target.value }))} className={inputClass} placeholder="등록 시 입력한 이메일" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">사업자번호</label>
            <input type="text" value={verifyForm.businessNumber} onChange={e => setVerifyForm(prev => ({ ...prev, businessNumber: e.target.value }))} className={inputClass} placeholder="000-00-00000" required />
          </div>
          <button type="submit" className="w-full bg-primary text-white py-3 rounded-lg font-medium hover:bg-primary-dark transition">본인 확인</button>
          <p className="text-center text-sm text-gray-500">
            업체 등록이 아직 안 되셨나요?{' '}
            <button type="button" onClick={() => navigate('/register')} className="text-primary hover:underline">업체 등록하기</button>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-100 mb-2">납품 가능 제품 선택</h1>
        <p className="text-gray-400"><span className="font-medium text-primary">{companyInfo.companyName}</span>에서 납품 가능한 제품을 선택하고 정보를 입력해주세요</p>
      </div>

      {products.length === 0 ? (
        <p className="text-gray-500 text-center py-8">등록된 제품이 없습니다.</p>
      ) : (
        <div className="space-y-4">
          {products.map(product => {
            const isSelected = !!selectedProducts[product.id];
            const productData = selectedProducts[product.id];
            const totalImages = isSelected ? ((productData.imageUrls?.length || 0) + (productData.imageFiles?.length || 0)) : 0;

            return (
              <div key={product.id} className={`bg-surface rounded-xl p-5 border transition ${isSelected ? 'border-primary shadow-lg shadow-primary/5' : 'border-border'}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={isSelected} onChange={() => toggleProduct(product.id)} className="mt-1 h-5 w-5 accent-purple-500 rounded" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-purple-500/15 text-purple-300 text-xs font-medium px-2 py-0.5 rounded">{product.category}</span>
                      <h3 className="font-semibold text-gray-100">{product.name}</h3>
                    </div>
                    <p className="text-sm text-gray-400">{product.description}</p>
                  </div>
                </div>

                {isSelected && (
                  <div className="mt-4 ml-8 space-y-4">
                    {/* 자사 제품명 */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">자사 브랜드 제품명</label>
                      <input
                        type="text"
                        value={productData?.customProductName || ''}
                        onChange={e => updateProductInfo(product.id, 'customProductName', e.target.value)}
                        className={inputClass}
                        placeholder="예: 히보스 프리미엄 수분크림"
                      />
                    </div>

                    {/* 제품 이미지 업로드 */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-2">제품 이미지 (최대 3장)</label>
                      <div className="flex gap-3 flex-wrap">
                        {(productData?.imagePreviews || []).map((preview, idx) => (
                          <div key={idx} className="relative group">
                            <img
                              src={preview}
                              alt={`제품 이미지 ${idx + 1}`}
                              className="w-24 h-24 object-cover rounded-lg border border-border"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(product.id, idx)}
                              className="absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                            >
                              x
                            </button>
                          </div>
                        ))}
                        {totalImages < 3 && (
                          <label className="w-24 h-24 border-2 border-dashed border-border-light rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-primary-light transition">
                            <span className="text-2xl text-gray-500">+</span>
                            <span className="text-xs text-gray-500 mt-1">{totalImages}/3</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              multiple
                              className="hidden"
                              onChange={e => handleImageAdd(product.id, e)}
                            />
                          </label>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">JPG, PNG, WEBP (각 5MB 이하)</p>
                    </div>

                    {/* 기존 입력 필드들 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        { field: 'moq', label: 'MOQ (최소주문수량) *', type: 'number', placeholder: '예: 1000' },
                        { field: 'cartonQuantity', label: '카툰박스 입수량 *', type: 'number', placeholder: '예: 50' },
                        { field: 'wholesalePrice', label: '도매가 (원) *', type: 'number', placeholder: '예: 5000' },
                        { field: 'deliveryPeriod', label: '납품 가능 기간 *', type: 'text', placeholder: '예: 2주' },
                      ].map(({ field, label, type, placeholder }) => (
                        <div key={field}>
                          <label className="block text-xs text-gray-400 mb-1">{label}</label>
                          <input type={type} value={productData?.[field] || ''} onChange={e => updateProductInfo(product.id, field, e.target.value)} className={inputClass} placeholder={placeholder} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="text-center pt-4">
            <button onClick={handleSubmit} disabled={submitting || Object.keys(selectedProducts).length === 0}
              className="bg-primary text-white px-8 py-3 rounded-lg font-medium hover:bg-primary-dark transition disabled:opacity-50">
              {submitting ? '저장 중...' : `선택한 ${Object.keys(selectedProducts).length}개 제품 저장`}
            </button>
          </div>
        </div>
      )}

      {companyInfo && (
        <div className="mt-8 bg-surface rounded-xl p-6 border border-border">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">수출 희망 품목 직접 입력</h2>
          <p className="text-sm text-gray-400 mb-4">위 목록에 없는 제품이 있다면, 수출하고 싶은 품목을 자유롭게 입력해주세요.</p>
          <textarea value={requestText} onChange={e => setRequestText(e.target.value)} rows={5}
            className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder-gray-500 mb-3"
            placeholder="예: 마스크팩, 세럼, 선크림 수출 희망합니다." />
          <button onClick={handleRequestSubmit} disabled={requestSubmitting || !requestText.trim()}
            className="bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50">
            {requestSubmitting ? '전송 중...' : '희망 품목 전달하기'}
          </button>
        </div>
      )}
    </div>
  );
}
