import { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage } from '../firebase/config';

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
  const [previewImage, setPreviewImage] = useState(null);
  const [emailModal, setEmailModal] = useState(null);
  const [emailForm, setEmailForm] = useState({ subject: '', body: '' });
  const [emailFiles, setEmailFiles] = useState([]);
  const [emailSending, setEmailSending] = useState(false);
  const [welcomeEmailModal, setWelcomeEmailModal] = useState(null);
  const [welcomeSending, setWelcomeSending] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState('');
  const [includeSignature, setIncludeSignature] = useState(true);

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

  useEffect(() => {
    getDownloadURL(ref(storage, 'admin/email-signature.png'))
      .then(url => setSignatureUrl(url))
      .catch(() => {});
  }, []);

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

  async function handleSignatureUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('이미지는 5MB 이하만 가능합니다.'); return; }
    try {
      const storageRef = ref(storage, 'admin/email-signature.png');
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setSignatureUrl(url);
      alert('서명 이미지가 등록되었습니다.');
    } catch (error) {
      console.error('서명 업로드 실패:', error);
      alert('서명 이미지 업로드에 실패했습니다.');
    }
    e.target.value = '';
  }

  function getSignatureHtml() {
    if (!includeSignature || !signatureUrl) return '';
    return `<div style="margin-top: 20px;"><img src="${signatureUrl}" alt="서명" style="max-width: 320px; border-radius: 8px;" /></div>`;
  }

  function openEmailModal(company) {
    setEmailModal(company);
    setEmailForm({ subject: '', body: '' });
    setEmailFiles([]);
  }

  async function handleSendEmail() {
    if (!emailForm.subject || !emailForm.body) { alert('제목과 내용을 입력해주세요.'); return; }
    setEmailSending(true);
    try {
      // PDF 파일 업로드
      const attachmentPaths = [];
      for (const file of emailFiles) {
        const storagePath = `email-attachments/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file);
        attachmentPaths.push(storagePath);
      }

      const functions = getFunctions(undefined, 'asia-northeast3');
      const sendEmail = httpsCallable(functions, 'sendEmail');
      await sendEmail({
        to: emailModal.email,
        subject: emailForm.subject,
        html: `
          <div style="font-family: 'Noto Sans KR', sans-serif; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #8b5cf6; font-size: 24px; margin: 0;">HIBOS Export</h1>
            </div>
            <h2 style="color: #333; font-size: 18px;">${emailForm.subject}</h2>
            <div style="color: #555; line-height: 1.8; font-size: 14px; white-space: pre-line;">${emailForm.body}</div>
            ${getSignatureHtml()}
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 12px; line-height: 1.6;">
              상호명: 히보스 | 대표자: 이주호<br/>
              사업자등록번호: 135-41-00648<br/>
              이메일: info@hibos.co.kr
            </p>
          </div>
        `,
        attachmentPaths,
      });
      alert(`${emailModal.companyName} (${emailModal.email})에 메일을 발송했습니다.`);
      setEmailModal(null);
    } catch (error) {
      console.error('메일 발송 실패:', error);
      alert('메일 발송 중 오류가 발생했습니다.');
    }
    setEmailSending(false);
  }

  function getWelcomeEmailHtml(company) {
    return `
      <div style="font-family: 'Noto Sans KR', sans-serif; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #8b5cf6; font-size: 24px; margin: 0;">HIBOS Export</h1>
        </div>
        <h2 style="color: #333; font-size: 18px;">안녕하세요, ${company.companyName} ${company.representative || ''}님!</h2>
        <p style="color: #555; line-height: 1.8; font-size: 14px;">
          HIBOS Export 플랫폼에 업체 등록해 주셔서 진심으로 감사드립니다.
        </p>
        <p style="color: #555; line-height: 1.8; font-size: 14px;">
          등록하신 정보를 확인 후, 빠른 시일 내에 연락드리겠습니다.<br/>
          납품 가능한 제품이 있으시면 아래 링크에서 제품 등록도 진행해 주세요.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="https://hibos-export.com/products"
            style="display: inline-block; background: #8b5cf6; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">
            납품 제품 등록하기
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px; line-height: 1.6;">
          상호명: 히보스 | 대표자: 이주호<br/>
          사업자등록번호: 135-41-00648<br/>
          이메일: info@hibos.co.kr
        </p>
      </div>
    `;
  }

  async function handleSendWelcomeEmail() {
    if (!welcomeEmailModal) return;
    setWelcomeSending(true);
    try {
      const functions = getFunctions(undefined, 'asia-northeast3');
      const sendEmail = httpsCallable(functions, 'sendEmail');
      await sendEmail({
        to: welcomeEmailModal.email,
        subject: `[HIBOS] ${welcomeEmailModal.companyName}님, 업체 등록이 완료되었습니다!`,
        html: getWelcomeEmailHtml(welcomeEmailModal),
        attachmentPaths: [],
      });
      alert(`${welcomeEmailModal.companyName} (${welcomeEmailModal.email})에 감사 메일을 발송했습니다.`);
      setWelcomeEmailModal(null);
    } catch (error) {
      console.error('감사 메일 발송 실패:', error);
      alert('메일 발송 중 오류가 발생했습니다.');
    }
    setWelcomeSending(false);
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
                        <button onClick={e => { e.stopPropagation(); setWelcomeEmailModal(company); }} className="text-blue-400 hover:underline mr-3 text-xs">감사메일</button>
                        <button onClick={e => { e.stopPropagation(); openEmailModal(company); }} className="text-green-400 hover:underline mr-3 text-xs">메일</button>
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
                      <th className="text-left px-4 py-2 font-medium text-gray-400">이미지</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-400">제품명</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-400">자사 제품명</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-400">MOQ</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-400">카툰 입수량</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-400">도매가(원)</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-400">납품 기간</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {getCompanyProducts(selectedCompany.id).map(cp => (
                      <tr key={cp.id}>
                        <td className="px-4 py-2">
                          {cp.productImages?.length > 0 ? (
                            <div className="flex gap-1">
                              {cp.productImages.map((img, i) => (
                                <img key={i} src={img} alt="" className="w-10 h-10 object-cover rounded border border-border cursor-pointer hover:opacity-80 transition"
                                  onClick={() => setPreviewImage(img)} />
                              ))}
                            </div>
                          ) : <span className="text-gray-600 text-xs">-</span>}
                        </td>
                        <td className="px-4 py-2 font-medium text-gray-100">{cp.productName}</td>
                        <td className="px-4 py-2 text-purple-300">{cp.customProductName || <span className="text-gray-600">-</span>}</td>
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
                      <th className="text-left px-4 py-2 font-medium text-gray-400">이미지</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-400">업체명</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-400">자사 제품명</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-400">MOQ</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-400">카툰 입수량</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-400">도매가(원)</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-400">납품 기간</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {suppliers.sort((a, b) => (a.wholesalePrice || 0) - (b.wholesalePrice || 0)).map(cp => (
                      <tr key={cp.id}>
                        <td className="px-4 py-2">
                          {cp.productImages?.length > 0 ? (
                            <div className="flex gap-1">
                              {cp.productImages.map((img, i) => (
                                <img key={i} src={img} alt="" className="w-10 h-10 object-cover rounded border border-border cursor-pointer hover:opacity-80 transition"
                                  onClick={() => setPreviewImage(img)} />
                              ))}
                            </div>
                          ) : <span className="text-gray-600 text-xs">-</span>}
                        </td>
                        <td className="px-4 py-2 font-medium text-gray-100">{cp.companyName}</td>
                        <td className="px-4 py-2 text-purple-300">{cp.customProductName || <span className="text-gray-600">-</span>}</td>
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

      {emailModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-border">
              <h3 className="font-semibold text-gray-100">메일 발송</h3>
              <button onClick={() => setEmailModal(null)} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">수신자</label>
                <p className="text-sm text-gray-100">{emailModal.companyName} &lt;{emailModal.email}&gt;</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">제목 *</label>
                <input type="text" value={emailForm.subject} onChange={e => setEmailForm(prev => ({ ...prev, subject: e.target.value }))}
                  className={inputClass} placeholder="메일 제목을 입력하세요" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">내용 *</label>
                <textarea value={emailForm.body} onChange={e => setEmailForm(prev => ({ ...prev, body: e.target.value }))}
                  rows={8} className={inputClass} placeholder="메일 내용을 입력하세요" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">첨부파일 (PDF)</label>
                <div className="space-y-2">
                  {emailFiles.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 bg-surface-dark rounded-lg px-3 py-2 text-sm">
                      <span className="text-gray-300 flex-1 truncate">{file.name}</span>
                      <span className="text-gray-500 text-xs">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
                      <button onClick={() => setEmailFiles(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-red-400 hover:text-red-300 text-xs">삭제</button>
                    </div>
                  ))}
                  <label className="inline-flex items-center gap-2 bg-surface-dark border border-border-light rounded-lg px-4 py-2 text-sm text-gray-400 cursor-pointer hover:border-primary hover:text-primary transition">
                    <span>+ 파일 첨부</span>
                    <input type="file" accept=".pdf" multiple className="hidden"
                      onChange={e => {
                        const files = Array.from(e.target.files).filter(f => {
                          if (f.size > 10 * 1024 * 1024) { alert(`"${f.name}" 파일이 10MB를 초과합니다.`); return false; }
                          return true;
                        });
                        setEmailFiles(prev => [...prev, ...files]);
                        e.target.value = '';
                      }} />
                  </label>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-gray-400">서명 (명함 이미지)</label>
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input type="checkbox" checked={includeSignature} onChange={e => setIncludeSignature(e.target.checked)}
                      className="rounded border-border" />
                    메일에 포함
                  </label>
                </div>
                {signatureUrl ? (
                  <div className="space-y-2">
                    <img src={signatureUrl} alt="서명" className="max-w-[200px] rounded-lg border border-border" />
                    <label className="inline-flex items-center gap-2 text-xs text-gray-500 cursor-pointer hover:text-primary transition">
                      <span>이미지 변경</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleSignatureUpload} />
                    </label>
                  </div>
                ) : (
                  <label className="inline-flex items-center gap-2 bg-surface-dark border border-border-light rounded-lg px-4 py-2 text-sm text-gray-400 cursor-pointer hover:border-primary hover:text-primary transition">
                    <span>+ 명함 이미지 등록</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleSignatureUpload} />
                  </label>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleSendEmail} disabled={emailSending || !emailForm.subject || !emailForm.body}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50">
                  {emailSending ? '발송 중...' : '메일 발송'}
                </button>
                <button onClick={() => setEmailModal(null)}
                  className="bg-surface-light text-gray-300 px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-border transition">취소</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {welcomeEmailModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-border">
              <h3 className="font-semibold text-gray-100">감사 메일 미리보기</h3>
              <button onClick={() => setWelcomeEmailModal(null)} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-4 text-sm">
                <div><span className="text-gray-500">수신:</span> <span className="text-gray-100">{welcomeEmailModal.companyName} &lt;{welcomeEmailModal.email}&gt;</span></div>
              </div>
              <div className="text-sm text-gray-300 mb-1">
                <span className="text-gray-500">제목:</span> [HIBOS] {welcomeEmailModal.companyName}님, 업체 등록이 완료되었습니다!
              </div>
              <div className="bg-white rounded-lg p-4 overflow-auto max-h-[50vh]"
                dangerouslySetInnerHTML={{ __html: getWelcomeEmailHtml(welcomeEmailModal) }} />
              <div className="flex gap-2 pt-2">
                <button onClick={handleSendWelcomeEmail} disabled={welcomeSending}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
                  {welcomeSending ? '발송 중...' : '감사 메일 발송'}
                </button>
                <button onClick={() => setWelcomeEmailModal(null)}
                  className="bg-surface-light text-gray-300 px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-border transition">취소</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-3xl max-h-[90vh] p-2">
            <button onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 bg-surface-light text-gray-300 hover:text-white w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold border border-border z-10">&times;</button>
            <img src={previewImage} alt="제품 이미지" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
