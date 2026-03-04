import { useState, useEffect, useMemo, Fragment } from 'react';
import { collection, getDocs, addDoc, query, where, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import * as XLSX from 'xlsx';

const cellInput = "w-full bg-transparent border border-transparent hover:border-border-light focus:border-primary rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary placeholder-gray-600";
const numInput = cellInput + " text-right";

export default function AdminBulkProductRegister({ company, products, existingCompanyProducts, onClose, onSaveComplete }) {
  const [activeTab, setActiveTab] = useState('direct');
  const [bulkData, setBulkData] = useState({});
  const [activeImageCell, setActiveImageCell] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ current: 0, total: 0 });
  const [excelErrors, setExcelErrors] = useState([]);

  // Initialize bulkData from existing records
  useEffect(() => {
    const initial = {};
    for (const product of products) {
      const existing = existingCompanyProducts.filter(cp => cp.productId === product.id);
      if (existing.length > 0) {
        const cp = existing[0];
        initial[product.id] = {
          checked: true,
          customProductName: cp.customProductName || '',
          moq: String(cp.moq || ''),
          cartonQuantity: String(cp.cartonQuantity || ''),
          wholesalePrice: String(cp.wholesalePrice || ''),
          deliveryPeriod: cp.deliveryPeriod || '',
          imageFiles: [],
          imagePreviews: [...(cp.productImages || [])],
          existingImageUrls: [...(cp.productImages || [])],
        };
      } else {
        initial[product.id] = {
          checked: false, customProductName: '', moq: '', cartonQuantity: '',
          wholesalePrice: '', deliveryPeriod: '', imageFiles: [], imagePreviews: [], existingImageUrls: [],
        };
      }
    }
    setBulkData(initial);
  }, [products, existingCompanyProducts]);

  // Clipboard paste handler
  useEffect(() => {
    function handlePaste(e) {
      if (!activeImageCell) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;

          const current = bulkData[activeImageCell];
          if (!current) return;
          const totalImages = (current.existingImageUrls?.length || 0) + (current.imageFiles?.length || 0);
          if (totalImages >= 3) { alert('이미지는 최대 3장까지 등록 가능합니다.'); return; }
          if (file.size > 5 * 1024 * 1024) { alert('이미지는 5MB 이하만 가능합니다.'); return; }

          const preview = URL.createObjectURL(file);
          setBulkData(prev => ({
            ...prev,
            [activeImageCell]: {
              ...prev[activeImageCell],
              checked: true,
              imageFiles: [...(prev[activeImageCell].imageFiles || []), file],
              imagePreviews: [...(prev[activeImageCell].imagePreviews || []), preview],
            },
          }));
          break;
        }
      }
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [activeImageCell, bulkData]);

  // Group products by category
  const grouped = useMemo(() => {
    const g = {};
    products.forEach(p => {
      const cat = p.category || '기타';
      if (!g[cat]) g[cat] = [];
      g[cat].push(p);
    });
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [products]);

  const checkedCount = Object.values(bulkData).filter(d => d.checked).length;

  function updateField(productId, field, value) {
    setBulkData(prev => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: value },
    }));
  }

  function toggleProduct(productId) {
    setBulkData(prev => ({
      ...prev,
      [productId]: { ...prev[productId], checked: !prev[productId]?.checked },
    }));
  }

  function toggleCategory(categoryProducts, checked) {
    setBulkData(prev => {
      const next = { ...prev };
      categoryProducts.forEach(p => {
        next[p.id] = { ...next[p.id], checked };
      });
      return next;
    });
  }

  function removeImage(productId, imgIndex) {
    setBulkData(prev => {
      const current = prev[productId];
      const existingCount = current.existingImageUrls?.length || 0;
      const newPreviews = [...current.imagePreviews];

      if (imgIndex < existingCount) {
        const newExisting = [...current.existingImageUrls];
        newExisting.splice(imgIndex, 1);
        newPreviews.splice(imgIndex, 1);
        return { ...prev, [productId]: { ...current, existingImageUrls: newExisting, imagePreviews: newPreviews } };
      } else {
        const fileIdx = imgIndex - existingCount;
        const newFiles = [...current.imageFiles];
        URL.revokeObjectURL(newPreviews[imgIndex]);
        newFiles.splice(fileIdx, 1);
        newPreviews.splice(imgIndex, 1);
        return { ...prev, [productId]: { ...current, imageFiles: newFiles, imagePreviews: newPreviews } };
      }
    });
  }

  // Excel template download
  function handleDownloadTemplate() {
    const headers = ['제품명', '카테고리', '자사제품명', 'MOQ', '카툰입수량', '도매가(원)', '납품기간'];
    const rows = products.map(p => [p.name, p.category || '', '', '', '', '', '']);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 25 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '납품정보');
    XLSX.writeFile(wb, `${company.companyName}_납품등록_템플릿.xlsx`);
  }

  // Excel upload & parse
  function handleExcelUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const rows = jsonData.slice(1).filter(row => row[0]);
      const errors = [];
      const parsed = {};

      for (let i = 0; i < rows.length; i++) {
        const [productName, , customName, moq, cartonQty, price, period] = rows[i];
        const matched = products.find(p => p.name.trim().toLowerCase() === String(productName || '').trim().toLowerCase());
        if (!matched) {
          errors.push(`행 ${i + 2}: "${productName}" — 제품을 찾을 수 없습니다.`);
          continue;
        }
        if (moq || cartonQty || price || period) {
          parsed[matched.id] = {
            checked: true,
            customProductName: String(customName || ''),
            moq: String(moq || ''),
            cartonQuantity: String(cartonQty || ''),
            wholesalePrice: String(price || ''),
            deliveryPeriod: String(period || ''),
            imageFiles: bulkData[matched.id]?.imageFiles || [],
            imagePreviews: bulkData[matched.id]?.imagePreviews || [],
            existingImageUrls: bulkData[matched.id]?.existingImageUrls || [],
          };
        }
      }

      setExcelErrors(errors);
      setBulkData(prev => {
        const next = { ...prev };
        for (const [pid, d] of Object.entries(parsed)) {
          next[pid] = { ...next[pid], ...d };
        }
        return next;
      });
      setActiveTab('direct');
      if (errors.length === 0) {
        alert(`${Object.keys(parsed).length}개 제품이 매핑되었습니다. 확인 후 저장해주세요.`);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  // Save all checked products
  async function handleBulkSave() {
    const checkedProducts = Object.entries(bulkData)
      .filter(([, d]) => d.checked)
      .map(([productId, d]) => ({ productId, ...d }));

    if (checkedProducts.length === 0) { alert('납품 등록할 제품을 선택해주세요.'); return; }

    for (const item of checkedProducts) {
      if (!item.moq || !item.cartonQuantity || !item.wholesalePrice || !item.deliveryPeriod) {
        const product = products.find(p => p.id === item.productId);
        alert(`"${product?.name}" 제품의 필수 항목(MOQ, 카툰입수량, 도매가, 납품기간)을 모두 입력해주세요.`);
        return;
      }
    }

    setSaving(true);
    setSaveProgress({ current: 0, total: checkedProducts.length });

    try {
      // Delete existing
      const existingQ = query(collection(db, 'companyProducts'), where('companyId', '==', company.id));
      const existingSnap = await getDocs(existingQ);
      for (const d of existingSnap.docs) { await deleteDoc(doc(db, 'companyProducts', d.id)); }

      // Save each checked product
      for (let i = 0; i < checkedProducts.length; i++) {
        const item = checkedProducts[i];
        setSaveProgress({ current: i + 1, total: checkedProducts.length });

        // Upload new images
        let allImageUrls = [...(item.existingImageUrls || [])];
        if (item.imageFiles?.length > 0) {
          for (let j = 0; j < item.imageFiles.length; j++) {
            const file = item.imageFiles[j];
            const ext = file.name?.split('.').pop() || 'png';
            const storageRef = ref(storage, `product-images/${company.id}/${item.productId}/${Date.now()}_0_${j}.${ext}`);
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);
            allImageUrls.push(url);
          }
        }

        const product = products.find(p => p.id === item.productId);
        await addDoc(collection(db, 'companyProducts'), {
          companyId: company.id,
          companyName: company.companyName,
          productId: item.productId,
          productName: product?.name || '',
          customProductName: item.customProductName || '',
          productImages: allImageUrls,
          moq: Number(item.moq),
          cartonQuantity: Number(item.cartonQuantity),
          wholesalePrice: Number(item.wholesalePrice),
          deliveryPeriod: item.deliveryPeriod,
          createdAt: serverTimestamp(),
        });
      }

      alert(`${checkedProducts.length}개 제품이 납품 등록되었습니다.`);
      onSaveComplete();
    } catch (error) {
      console.error('일괄 저장 실패:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-surface rounded-xl border border-border w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border shrink-0">
          <div>
            <h3 className="font-semibold text-gray-100 text-lg">납품 등록 대행</h3>
            <p className="text-sm text-gray-400 mt-0.5">{company.companyName} — {company.representative || ''}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-gray-500 hover:text-gray-300 text-2xl leading-none">&times;</button>
        </div>

        {/* Tabs + Actions */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border shrink-0 gap-3">
          <div className="flex gap-2">
            <button onClick={() => setActiveTab('direct')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === 'direct' ? 'bg-primary text-white' : 'bg-surface-dark text-gray-400 hover:text-gray-300'}`}>
              직접 입력
            </button>
            <button onClick={() => setActiveTab('excel')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === 'excel' ? 'bg-primary text-white' : 'bg-surface-dark text-gray-400 hover:text-gray-300'}`}>
              엑셀 업로드
            </button>
          </div>
          <div className="text-sm text-gray-400">
            선택: <span className="text-primary font-medium">{checkedCount}</span> / {products.length}개
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'direct' && (
            <div>
              {excelErrors.length > 0 && (
                <div className="mx-4 mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-300 mb-1">엑셀 매핑 오류</p>
                  {excelErrors.map((err, i) => (
                    <p key={i} className="text-xs text-red-400">{err}</p>
                  ))}
                  <button onClick={() => setExcelErrors([])} className="text-xs text-red-300 hover:underline mt-1">닫기</button>
                </div>
              )}

              <table className="w-full text-sm">
                <thead className="bg-surface-dark sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2.5 w-10"></th>
                    <th className="text-left px-2 py-2.5 font-medium text-gray-400 w-24">카테고리</th>
                    <th className="text-left px-2 py-2.5 font-medium text-gray-400 min-w-[140px]">제품명</th>
                    <th className="text-left px-2 py-2.5 font-medium text-gray-400 min-w-[120px]">자사제품명</th>
                    <th className="text-right px-2 py-2.5 font-medium text-gray-400 w-20">MOQ</th>
                    <th className="text-right px-2 py-2.5 font-medium text-gray-400 w-20">카툰</th>
                    <th className="text-right px-2 py-2.5 font-medium text-gray-400 w-24">도매가(원)</th>
                    <th className="text-left px-2 py-2.5 font-medium text-gray-400 w-24">납품기간</th>
                    <th className="text-left px-2 py-2.5 font-medium text-gray-400 w-32">이미지</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([category, catProducts]) => {
                    const allChecked = catProducts.every(p => bulkData[p.id]?.checked);
                    const someChecked = catProducts.some(p => bulkData[p.id]?.checked);
                    return (
                      <Fragment key={category}>
                        <tr className="bg-surface-dark/50">
                          <td className="px-2 py-2">
                            <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                              onChange={e => toggleCategory(catProducts, e.target.checked)}
                              className="rounded border-border accent-violet-500 cursor-pointer" />
                          </td>
                          <td colSpan={8} className="px-2 py-2">
                            <span className="bg-purple-500/15 text-purple-300 text-xs font-medium px-2 py-0.5 rounded">{category}</span>
                            <span className="text-gray-500 text-xs ml-2">{catProducts.length}개</span>
                          </td>
                        </tr>
                        {catProducts.map(product => {
                          const d = bulkData[product.id] || {};
                          return (
                            <tr key={product.id} className={`border-b border-border/50 transition ${d.checked ? 'bg-primary/5' : 'hover:bg-surface-light'}`}>
                              <td className="px-2 py-1.5">
                                <input type="checkbox" checked={!!d.checked} onChange={() => toggleProduct(product.id)}
                                  className="rounded border-border accent-violet-500 cursor-pointer" />
                              </td>
                              <td className="px-2 py-1.5 text-xs text-gray-500">{product.category}</td>
                              <td className="px-2 py-1.5 font-medium text-gray-100 text-xs">{product.name}</td>
                              <td className="px-1 py-1">
                                <input type="text" value={d.customProductName || ''} placeholder="자사 제품명"
                                  onChange={e => updateField(product.id, 'customProductName', e.target.value)}
                                  className={cellInput + " text-xs"} />
                              </td>
                              <td className="px-1 py-1">
                                <input type="number" value={d.moq || ''} placeholder="MOQ"
                                  onChange={e => updateField(product.id, 'moq', e.target.value)}
                                  className={numInput + " text-xs"} />
                              </td>
                              <td className="px-1 py-1">
                                <input type="number" value={d.cartonQuantity || ''} placeholder="입수량"
                                  onChange={e => updateField(product.id, 'cartonQuantity', e.target.value)}
                                  className={numInput + " text-xs"} />
                              </td>
                              <td className="px-1 py-1">
                                <input type="number" value={d.wholesalePrice || ''} placeholder="도매가"
                                  onChange={e => updateField(product.id, 'wholesalePrice', e.target.value)}
                                  className={numInput + " text-xs"} />
                              </td>
                              <td className="px-1 py-1">
                                <input type="text" value={d.deliveryPeriod || ''} placeholder="예: 2주"
                                  onChange={e => updateField(product.id, 'deliveryPeriod', e.target.value)}
                                  className={cellInput + " text-xs"} />
                              </td>
                              <td className="px-1 py-1">
                                <div
                                  onClick={() => setActiveImageCell(product.id)}
                                  className={`min-h-[40px] rounded-lg border-2 border-dashed p-1 flex gap-1 items-center cursor-pointer transition ${
                                    activeImageCell === product.id
                                      ? 'border-primary bg-primary/5'
                                      : 'border-border-light hover:border-border'
                                  }`}
                                >
                                  {(d.imagePreviews || []).map((src, idx) => (
                                    <div key={idx} className="relative group shrink-0">
                                      <img src={src} alt="" className="w-9 h-9 object-cover rounded border border-border" />
                                      <button onClick={e => { e.stopPropagation(); removeImage(product.id, idx); }}
                                        className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition">x</button>
                                    </div>
                                  ))}
                                  {(d.imagePreviews?.length || 0) < 3 && (
                                    <div className="flex flex-col items-center justify-center text-gray-500 px-1">
                                      <span className="text-sm leading-none">+</span>
                                      {activeImageCell === product.id && (
                                        <span className="text-[9px] text-primary font-medium mt-0.5">Ctrl+V</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'excel' && (
            <div className="p-5 sm:p-8 space-y-6">
              {/* Step 1: Download template */}
              <div className="bg-surface-dark rounded-xl p-5 border border-border">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-primary/20 text-primary rounded-full flex items-center justify-center font-bold text-sm shrink-0">1</div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-100 mb-1">엑셀 템플릿 다운로드</h4>
                    <p className="text-sm text-gray-400 mb-3">제품명과 카테고리가 미리 채워진 엑셀 파일을 다운로드합니다.</p>
                    <button onClick={handleDownloadTemplate}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      템플릿 다운로드 (.xlsx)
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 2: Fill in data */}
              <div className="bg-surface-dark rounded-xl p-5 border border-border">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-primary/20 text-primary rounded-full flex items-center justify-center font-bold text-sm shrink-0">2</div>
                  <div>
                    <h4 className="font-medium text-gray-100 mb-1">데이터 입력</h4>
                    <p className="text-sm text-gray-400">업체로부터 받은 자료를 참고하여 MOQ, 도매가, 카툰입수량, 납품기간을 채워주세요.</p>
                    <p className="text-xs text-gray-500 mt-1">* 납품하지 않는 제품은 빈 칸으로 두면 됩니다.</p>
                  </div>
                </div>
              </div>

              {/* Step 3: Upload */}
              <div className="bg-surface-dark rounded-xl p-5 border border-border">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-primary/20 text-primary rounded-full flex items-center justify-center font-bold text-sm shrink-0">3</div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-100 mb-1">엑셀 파일 업로드</h4>
                    <p className="text-sm text-gray-400 mb-3">작성한 엑셀 파일을 업로드하면 자동으로 제품이 매핑됩니다.</p>
                    <label className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer hover:bg-primary-dark transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      엑셀 파일 선택 (.xlsx, .xls)
                      <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelUpload} />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-border shrink-0 flex items-center justify-between gap-3">
          {saving ? (
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-gray-300">저장 중...</span>
                <span className="text-sm text-primary font-medium">{saveProgress.current} / {saveProgress.total}</span>
              </div>
              <div className="w-full bg-border rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${saveProgress.total > 0 ? (saveProgress.current / saveProgress.total * 100) : 0}%` }} />
              </div>
            </div>
          ) : (
            <>
              <button onClick={onClose} className="bg-surface-light text-gray-300 px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-border transition">취소</button>
              <button onClick={handleBulkSave} disabled={checkedCount === 0}
                className="bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {checkedCount}개 제품 일괄 저장
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
