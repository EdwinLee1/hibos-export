import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { useNavigate } from 'react-router-dom';

export default function CompanyRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ companyName: '', businessNumber: '', representative: '', phone: '', email: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  }

  function validate() {
    const newErrors = {};
    if (!form.companyName.trim()) newErrors.companyName = '회사명을 입력해주세요';
    if (!form.businessNumber.trim()) newErrors.businessNumber = '사업자번호를 입력해주세요';
    else if (!/^\d{3}-\d{2}-\d{5}$/.test(form.businessNumber)) newErrors.businessNumber = '사업자번호 형식: 000-00-00000';
    if (!form.representative.trim()) newErrors.representative = '대표자명을 입력해주세요';
    if (!form.phone.trim()) newErrors.phone = '연락처를 입력해주세요';
    if (!form.email.trim()) newErrors.email = '이메일을 입력해주세요';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) newErrors.email = '올바른 이메일 형식을 입력해주세요';
    if (!file) newErrors.file = '사업자등록증을 업로드해주세요';
    return newErrors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setSubmitting(true);
    try {
      let businessLicenseUrl = '';
      if (file) {
        const ext = file.name.split('.').pop();
        const storageRef = ref(storage, `business-licenses/${Date.now()}_${form.businessNumber.replace(/-/g, '')}.${ext}`);
        const snapshot = await uploadBytes(storageRef, file);
        businessLicenseUrl = await getDownloadURL(snapshot.ref);
      }
      const docRef = await addDoc(collection(db, 'companies'), { ...form, businessLicenseUrl, businessLicenseFileName: file?.name || '', registeredAt: serverTimestamp() });
      setSuccess(true);
      setTimeout(() => { navigate('/products', { state: { companyId: docRef.id, companyName: form.companyName, email: form.email, businessNumber: form.businessNumber } }); }, 1500);
    } catch (error) {
      console.error('업체 등록 실패:', error);
      alert('등록 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
    setSubmitting(false);
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4 text-green-400">&#10003;</div>
        <h2 className="text-2xl font-bold text-gray-100 mb-2">업체 등록 완료!</h2>
        <p className="text-gray-400">납품 가능 제품 선택 페이지로 이동합니다...</p>
      </div>
    );
  }

  const inputClass = "w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder-gray-500";

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-100 mb-2">업체 등록</h1>
        <p className="text-gray-400">수출 가능 업체 정보를 등록해주세요</p>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl p-6 border border-border space-y-5">
        {[
          { name: 'companyName', label: '회사명 *', placeholder: '주식회사 OOO', type: 'text' },
          { name: 'businessNumber', label: '사업자번호 *', placeholder: '000-00-00000', type: 'text' },
          { name: 'representative', label: '대표자명 *', placeholder: '홍길동', type: 'text' },
          { name: 'phone', label: '연락처 *', placeholder: '010-0000-0000', type: 'text' },
          { name: 'email', label: '이메일 *', placeholder: 'example@company.com', type: 'email' },
        ].map(field => (
          <div key={field.name}>
            <label className="block text-sm font-medium text-gray-300 mb-1">{field.label}</label>
            <input type={field.type} name={field.name} value={form[field.name]} onChange={handleChange} className={inputClass} placeholder={field.placeholder} />
            {errors[field.name] && <p className="text-red-400 text-xs mt-1">{errors[field.name]}</p>}
          </div>
        ))}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">사업자등록증 *</label>
          <p className="text-xs text-gray-500 mb-2">PDF 또는 이미지 파일(JPG, PNG)을 업로드해주세요</p>
          <label className="flex items-center gap-3 w-full border border-border-light border-dashed rounded-lg px-3 py-3 cursor-pointer hover:border-primary hover:bg-primary-light transition">
            <span className="bg-surface-light text-gray-300 text-xs px-3 py-1.5 rounded font-medium">파일 선택</span>
            <span className="text-sm text-gray-400 truncate flex-1">{fileName || '파일을 선택해주세요'}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
              onChange={e => { const f = e.target.files[0]; if (f) { if (f.size > 10 * 1024 * 1024) { alert('파일 크기는 10MB 이하만 가능합니다.'); return; } setFile(f); setFileName(f.name); if (errors.file) setErrors(prev => ({ ...prev, file: '' })); } }} />
          </label>
          {errors.file && <p className="text-red-400 text-xs mt-1">{errors.file}</p>}
        </div>
        <button type="submit" disabled={submitting}
          className="w-full bg-primary text-white py-3 rounded-lg font-medium hover:bg-primary-dark transition disabled:opacity-50">
          {submitting ? '등록 중...' : '업체 등록'}
        </button>
      </form>
    </div>
  );
}
