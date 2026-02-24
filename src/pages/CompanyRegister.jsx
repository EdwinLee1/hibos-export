import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';

export default function CompanyRegister() {
  const navigate = useNavigate();
  const { t } = useLanguage();
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
    if (!form.companyName.trim()) newErrors.companyName = t('register.errors.companyName');
    if (!form.businessNumber.trim()) newErrors.businessNumber = t('register.errors.bizNumber');
    else if (!/^\d{3}-\d{2}-\d{5}$/.test(form.businessNumber)) newErrors.businessNumber = t('register.errors.bizNumberFormat');
    if (!form.representative.trim()) newErrors.representative = t('register.errors.representative');
    if (!form.phone.trim()) newErrors.phone = t('register.errors.phone');
    if (!form.email.trim()) newErrors.email = t('register.errors.email');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) newErrors.email = t('register.errors.emailFormat');
    if (!file) newErrors.file = t('register.errors.file');
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
      alert(t('register.errors.submitFail'));
    }
    setSubmitting(false);
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4 text-green-400">&#10003;</div>
        <h2 className="text-2xl font-bold text-gray-100 mb-2">{t('register.successTitle')}</h2>
        <p className="text-gray-400">{t('register.successMsg')}</p>
      </div>
    );
  }

  const inputClass = "w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder-gray-500";

  const fields = [
    { name: 'companyName', label: t('register.companyName'), placeholder: t('register.companyNamePH'), type: 'text' },
    { name: 'businessNumber', label: t('register.bizNumber'), placeholder: t('register.bizNumberPH'), type: 'text' },
    { name: 'representative', label: t('register.representative'), placeholder: t('register.representativePH'), type: 'text' },
    { name: 'phone', label: t('register.phone'), placeholder: t('register.phonePH'), type: 'text' },
    { name: 'email', label: t('register.email'), placeholder: t('register.emailPH'), type: 'email' },
  ];

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-100 mb-2">{t('register.title')}</h1>
        <p className="text-gray-400">{t('register.subtitle')}</p>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl p-6 border border-border space-y-5">
        {fields.map(field => (
          <div key={field.name}>
            <label className="block text-sm font-medium text-gray-300 mb-1">{field.label}</label>
            <input type={field.type} name={field.name} value={form[field.name]} onChange={handleChange} className={inputClass} placeholder={field.placeholder} />
            {errors[field.name] && <p className="text-red-400 text-xs mt-1">{errors[field.name]}</p>}
          </div>
        ))}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">{t('register.bizLicense')}</label>
          <p className="text-xs text-gray-500 mb-2">{t('register.bizLicenseDesc')}</p>
          <label className="flex items-center gap-3 w-full border border-border-light border-dashed rounded-lg px-3 py-3 cursor-pointer hover:border-primary hover:bg-primary-light transition">
            <span className="bg-surface-light text-gray-300 text-xs px-3 py-1.5 rounded font-medium">{t('register.selectFile')}</span>
            <span className="text-sm text-gray-400 truncate flex-1">{fileName || t('register.selectFilePH')}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
              onChange={e => { const f = e.target.files[0]; if (f) { if (f.size > 10 * 1024 * 1024) { alert(t('register.errors.fileSizeOver')); return; } setFile(f); setFileName(f.name); if (errors.file) setErrors(prev => ({ ...prev, file: '' })); } }} />
          </label>
          {errors.file && <p className="text-red-400 text-xs mt-1">{errors.file}</p>}
        </div>
        <button type="submit" disabled={submitting}
          className="w-full bg-primary text-white py-3 rounded-lg font-medium hover:bg-primary-dark transition disabled:opacity-50">
          {submitting ? t('register.submitting') : t('register.submit')}
        </button>
      </form>
    </div>
  );
}
