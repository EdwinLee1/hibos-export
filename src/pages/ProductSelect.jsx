import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, where, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';

const emptyEntry = () => ({ customProductName: '', imageFiles: [], imageUrls: [], imagePreviews: [], moq: '', cartonQuantity: '', wholesalePrice: '', deliveryPeriod: '' });

export default function ProductSelect() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, tc } = useLanguage();
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
      if (snap.empty) { alert(t('products.verifyFail')); return; }
      const companyDoc = snap.docs[0];
      setCompanyInfo({ companyId: companyDoc.id, companyName: companyDoc.data().companyName, email: companyDoc.data().email, businessNumber: companyDoc.data().businessNumber });

      const existingQ = query(collection(db, 'companyProducts'), where('companyId', '==', companyDoc.id));
      const existingSnap = await getDocs(existingQ);
      const existing = {};
      existingSnap.docs.forEach(d => {
        const data = d.data();
        const entry = {
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
        if (!existing[data.productId]) {
          existing[data.productId] = [entry];
        } else {
          existing[data.productId].push(entry);
        }
      });
      setSelectedProducts(existing);
    } catch (error) { console.error('인증 실패:', error); alert(t('products.verifyError')); }
  }

  function toggleProduct(productId) {
    setSelectedProducts(prev => {
      if (prev[productId]) { const next = { ...prev }; delete next[productId]; return next; }
      return { ...prev, [productId]: [emptyEntry()] };
    });
  }

  function addEntry(productId) {
    setSelectedProducts(prev => ({
      ...prev,
      [productId]: [...(prev[productId] || []), emptyEntry()]
    }));
  }

  function removeEntry(productId, entryIndex) {
    setSelectedProducts(prev => {
      const entries = prev[productId];
      if (entries.length <= 1) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: entries.filter((_, i) => i !== entryIndex) };
    });
  }

  function updateEntryInfo(productId, entryIndex, field, value) {
    setSelectedProducts(prev => ({
      ...prev,
      [productId]: prev[productId].map((entry, i) => i === entryIndex ? { ...entry, [field]: value } : entry)
    }));
  }

  function handleImageAdd(productId, entryIndex, e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setSelectedProducts(prev => {
      const entries = [...prev[productId]];
      const current = entries[entryIndex];
      const totalImages = (current.imageFiles?.length || 0) + (current.imageUrls?.length || 0);
      const remaining = 3 - totalImages;

      if (remaining <= 0) {
        alert(t('products.imageMaxAlert'));
        return prev;
      }

      const validFiles = files.slice(0, remaining).filter(f => {
        if (f.size > 5 * 1024 * 1024) { alert(`"${f.name}" 파일이 5MB를 초과합니다.`); return false; }
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { alert(`"${f.name}" 은(는) 지원하지 않는 형식입니다. (JPG, PNG, WEBP만 가능)`); return false; }
        return true;
      });

      const newPreviews = validFiles.map(f => URL.createObjectURL(f));
      entries[entryIndex] = {
        ...current,
        imageFiles: [...(current.imageFiles || []), ...validFiles],
        imagePreviews: [...(current.imagePreviews || []), ...newPreviews]
      };

      return { ...prev, [productId]: entries };
    });

    e.target.value = '';
  }

  function removeImage(productId, entryIndex, imgIndex) {
    setSelectedProducts(prev => {
      const entries = [...prev[productId]];
      const current = entries[entryIndex];
      const existingUrlCount = current.imageUrls?.length || 0;

      if (imgIndex < existingUrlCount) {
        const newUrls = [...current.imageUrls];
        newUrls.splice(imgIndex, 1);
        const newPreviews = [...current.imagePreviews];
        newPreviews.splice(imgIndex, 1);
        entries[entryIndex] = { ...current, imageUrls: newUrls, imagePreviews: newPreviews };
      } else {
        const fileIndex = imgIndex - existingUrlCount;
        const newFiles = [...current.imageFiles];
        newFiles.splice(fileIndex, 1);
        const newPreviews = [...current.imagePreviews];
        URL.revokeObjectURL(newPreviews[imgIndex]);
        newPreviews.splice(imgIndex, 1);
        entries[entryIndex] = { ...current, imageFiles: newFiles, imagePreviews: newPreviews };
      }

      return { ...prev, [productId]: entries };
    });
  }

  async function uploadImages(companyId, productId, entryIndex, files) {
    const urls = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop();
      const storageRef = ref(storage, `product-images/${companyId}/${productId}/${Date.now()}_${entryIndex}_${i}.${ext}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      urls.push(url);
    }
    return urls;
  }

  async function handleRequestSubmit() {
    if (!requestText.trim()) { alert(t('products.requestEmpty')); return; }
    setRequestSubmitting(true);
    try {
      await addDoc(collection(db, 'companyRequests'), { companyId: companyInfo.companyId, companyName: companyInfo.companyName, email: companyInfo.email, requestText: requestText.trim(), status: 'pending', createdAt: serverTimestamp() });
      alert(t('products.requestSuccess'));
      setRequestText('');
    } catch (error) { console.error('요청 저장 실패:', error); alert(t('products.requestFail')); }
    setRequestSubmitting(false);
  }

  async function handleSubmit() {
    for (const [productId, entries] of Object.entries(selectedProducts)) {
      for (let i = 0; i < entries.length; i++) {
        const info = entries[i];
        if (!info.moq || !info.cartonQuantity || !info.wholesalePrice || !info.deliveryPeriod) {
          const product = products.find(p => p.id === productId);
          alert(`"${product?.name}" ${entries.length > 1 ? `#${i + 1} ` : ''}${t('products.requiredAlert')}`);
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      const existingQ = query(collection(db, 'companyProducts'), where('companyId', '==', companyInfo.companyId));
      const existingSnap = await getDocs(existingQ);
      for (const d of existingSnap.docs) { await deleteDoc(doc(db, 'companyProducts', d.id)); }

      for (const [productId, entries] of Object.entries(selectedProducts)) {
        const product = products.find(p => p.id === productId);

        for (let i = 0; i < entries.length; i++) {
          const info = entries[i];
          let allImageUrls = [...(info.imageUrls || [])];
          if (info.imageFiles && info.imageFiles.length > 0) {
            const newUrls = await uploadImages(companyInfo.companyId, productId, i, info.imageFiles);
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
      }
      setSuccess(true);
    } catch (error) { console.error('저장 실패:', error); alert(t('products.saveFail')); }
    setSubmitting(false);
  }

  const totalEntries = Object.values(selectedProducts).reduce((sum, entries) => sum + entries.length, 0);

  const inputClass = "w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder-gray-500";

  if (loading) {
    return (<div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>);
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4 text-green-400">&#10003;</div>
        <h2 className="text-2xl font-bold text-gray-100 mb-2">{t('products.successTitle')}</h2>
        <p className="text-gray-400 mb-6">{t('products.successMsg')}</p>
        <button onClick={() => navigate('/')} className="bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-dark transition">{t('products.goHome')}</button>
      </div>
    );
  }

  if (!companyInfo) {
    return (
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-100 mb-2">{t('products.title')}</h1>
          <p className="text-gray-400">{t('products.verifySubtitle')}</p>
        </div>
        <form onSubmit={handleVerify} className="bg-surface rounded-xl p-6 border border-border space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('products.verifyEmail')}</label>
            <input type="email" value={verifyForm.email} onChange={e => setVerifyForm(prev => ({ ...prev, email: e.target.value }))} className={inputClass} placeholder={t('products.verifyEmailPH')} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('products.verifyBizNumber')}</label>
            <input type="text" value={verifyForm.businessNumber} onChange={e => setVerifyForm(prev => ({ ...prev, businessNumber: e.target.value }))} className={inputClass} placeholder={t('products.verifyBizNumberPH')} required />
          </div>
          <button type="submit" className="w-full bg-primary text-white py-3 rounded-lg font-medium hover:bg-primary-dark transition">{t('products.verifyButton')}</button>
          <p className="text-center text-sm text-gray-500">
            {t('products.notRegistered')}{' '}
            <button type="button" onClick={() => navigate('/register')} className="text-primary hover:underline">{t('products.goRegister')}</button>
          </p>
        </form>
      </div>
    );
  }

  const entryFields = [
    { field: 'moq', label: t('products.moq'), type: 'number', placeholder: t('products.moqPH') },
    { field: 'cartonQuantity', label: t('products.cartonQty'), type: 'number', placeholder: t('products.cartonQtyPH') },
    { field: 'wholesalePrice', label: t('products.wholesalePrice'), type: 'number', placeholder: t('products.wholesalePricePH') },
    { field: 'deliveryPeriod', label: t('products.deliveryPeriod'), type: 'text', placeholder: t('products.deliveryPeriodPH') },
  ];

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-100 mb-2">{t('products.selectTitle')}</h1>
        <p className="text-gray-400"><span className="font-medium text-primary">{companyInfo.companyName}</span>{t('products.selectSubtitle')}</p>
      </div>

      {products.length === 0 ? (
        <p className="text-gray-500 text-center py-8">{t('products.noProducts')}</p>
      ) : (
        <div className="space-y-4">
          {products.map(product => {
            const entries = selectedProducts[product.id] || [];
            const isSelected = entries.length > 0;

            return (
              <div key={product.id} className={`bg-surface rounded-xl p-4 sm:p-5 border transition ${isSelected ? 'border-primary shadow-lg shadow-primary/5' : 'border-border'}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={isSelected} onChange={() => toggleProduct(product.id)} className="mt-1 h-5 w-5 accent-purple-500 rounded" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="bg-purple-500/15 text-purple-300 text-xs font-medium px-2 py-0.5 rounded">{tc(product.category)}</span>
                      <h3 className="font-semibold text-gray-100 text-sm sm:text-base">{product.name}</h3>
                      {entries.length > 1 && (
                        <span className="bg-primary-light text-primary text-xs font-medium px-2 py-0.5 rounded-full">{entries.length}{t('products.registered')}</span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-gray-400">{product.description}</p>
                  </div>
                </div>

                {isSelected && (
                  <div className="mt-4 ml-0 sm:ml-8 space-y-4">
                    {entries.map((entry, entryIndex) => {
                      const totalImages = (entry.imageUrls?.length || 0) + (entry.imageFiles?.length || 0);
                      return (
                        <div key={entryIndex} className={`space-y-4 ${entries.length > 1 ? 'bg-surface-dark rounded-xl p-3 sm:p-4 border border-border relative' : ''}`}>
                          {entries.length > 1 && (
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-primary">#{entryIndex + 1}</span>
                              <button type="button" onClick={() => removeEntry(product.id, entryIndex)}
                                className="text-red-400 hover:text-red-300 text-xs hover:underline">{t('products.delete')}</button>
                            </div>
                          )}

                          <div>
                            <label className="block text-xs text-gray-400 mb-1">{t('products.customProductName')}</label>
                            <input
                              type="text"
                              value={entry.customProductName || ''}
                              onChange={e => updateEntryInfo(product.id, entryIndex, 'customProductName', e.target.value)}
                              className={inputClass}
                              placeholder={t('products.customProductNamePH')}
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-gray-400 mb-2">{t('products.productImages')}</label>
                            <div className="flex gap-2 sm:gap-3 flex-wrap">
                              {(entry.imagePreviews || []).map((preview, idx) => (
                                <div key={idx} className="relative group">
                                  <img src={preview} alt={`${idx + 1}`} className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg border border-border" />
                                  <button type="button" onClick={() => removeImage(product.id, entryIndex, idx)}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition">x</button>
                                </div>
                              ))}
                              {totalImages < 3 && (
                                <label className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-dashed border-border-light rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-primary-light transition">
                                  <span className="text-2xl text-gray-500">+</span>
                                  <span className="text-xs text-gray-500 mt-1">{totalImages}/3</span>
                                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
                                    onChange={e => handleImageAdd(product.id, entryIndex, e)} />
                                </label>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{t('products.imageFormats')}</p>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {entryFields.map(({ field, label, type, placeholder }) => (
                              <div key={field}>
                                <label className="block text-xs text-gray-400 mb-1">{label}</label>
                                <input type={type} value={entry[field] || ''} onChange={e => updateEntryInfo(product.id, entryIndex, field, e.target.value)} className={inputClass} placeholder={placeholder} />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    <button type="button" onClick={() => addEntry(product.id)}
                      className="w-full py-2.5 border-2 border-dashed border-border-light rounded-xl text-sm text-gray-400 hover:border-primary hover:text-primary hover:bg-primary-light transition flex items-center justify-center gap-2">
                      <span className="text-lg">+</span> {t('products.addMore')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div className="text-center pt-4">
            <button onClick={handleSubmit} disabled={submitting || totalEntries === 0}
              className="bg-primary text-white px-8 py-3 rounded-lg font-medium hover:bg-primary-dark transition disabled:opacity-50">
              {submitting ? t('products.saving') : t('products.saveButton').replace('{count}', totalEntries)}
            </button>
          </div>
        </div>
      )}

      {companyInfo && (
        <div className="mt-8 bg-surface rounded-xl p-4 sm:p-6 border border-border">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">{t('products.requestTitle')}</h2>
          <p className="text-sm text-gray-400 mb-4">{t('products.requestDesc')}</p>
          <textarea value={requestText} onChange={e => setRequestText(e.target.value)} rows={5}
            className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder-gray-500 mb-3"
            placeholder={t('products.requestPH')} />
          <button onClick={handleRequestSubmit} disabled={requestSubmitting || !requestText.trim()}
            className="bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50">
            {requestSubmitting ? t('products.requestSending') : t('products.requestButton')}
          </button>
        </div>
      )}
    </div>
  );
}
