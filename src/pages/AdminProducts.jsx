import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const emptyProduct = {
  name: '',
  category: '',
  ingredients: '',
  functions: '',
  targetCountries: '',
  requiredDocuments: '',
  description: ''
};

const emptyCountry = { name: '', code: '', requirements: '', documents: '' };

// 쉼표로 구분된 카테고리명을 개별 항목으로 분리
function splitCategoryItems(text) {
  const parens = [];
  let processed = text.replace(/\(([^)]+)\)/g, (match) => {
    const idx = parens.length;
    parens.push(match);
    return `\u00A7${idx}\u00A7`;
  });
  let parts = processed.split(/,/).map(s => s.trim()).filter(Boolean);
  parts = parts.map(p => p.replace(/^\s*(plus|and|&)\s+/i, '').trim()).filter(Boolean);
  parts = parts.map(p => p.replace(/\u00A7(\d+)\u00A7/g, (_, idx) => parens[parseInt(idx)]));
  return parts;
}

// 텍스트에서 카테고리 + 성분 파싱
function parseEmailText(text) {
  const results = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let currentCategory = null;
  let currentSkuCount = null;
  let ingredientLines = [];

  function flushCategory() {
    if (currentCategory) {
      const ingredients = ingredientLines.join(', ');
      const items = splitCategoryItems(currentCategory);
      if (items.length > 1) {
        for (const item of items) {
          results.push({
            name: item, category: item,
            ingredients, functions: '', requiredDocuments: '', description: '',
            targetCountries: '', selected: true
          });
        }
      } else {
        results.push({
          name: currentCategory, category: currentCategory,
          ingredients, functions: '', requiredDocuments: '',
          description: currentSkuCount ? `${currentSkuCount} SKUs` : '',
          targetCountries: '', selected: true
        });
      }
    }
  }

  for (const line of lines) {
    const categoryMatch = line.match(/^\*\s*(.+?)(?:\s*\((\d+)\s*SKUs?\))?$/i);
    const categoryMatch2 = !categoryMatch ? line.match(/^[-–—]\s*(.+?)(?:\s*\((\d+)\s*SKUs?\))?$/i) : null;
    const match = categoryMatch || categoryMatch2;
    if (match) {
      flushCategory();
      currentCategory = match[1].replace(/\s*[-–—]\s*$/, '').trim();
      currentSkuCount = match[2] ? parseInt(match[2]) : null;
      ingredientLines = [];
    } else if (currentCategory) {
      const skipPatterns = /^(requirements|all cosmetic|samples|we recommend|registration|ingredient compliance|claims|factory|individual|official)/i;
      if (!skipPatterns.test(line)) {
        ingredientLines.push(line.replace(/^[,\s]+|[,\s]+$/g, ''));
      }
    }
  }
  flushCategory();
  return results;
}

// 국가명/형용사 → 국가 정보 매핑
const COUNTRY_DATA = [
  ['egypt,egyptian', 'Egypt', 'EG'],
  ['vietnam,vietnamese', 'Vietnam', 'VN'],
  ['thailand,thai', 'Thailand', 'TH'],
  ['china,chinese', 'China', 'CN'],
  ['japan,japanese', 'Japan', 'JP'],
  ['indonesia,indonesian', 'Indonesia', 'ID'],
  ['malaysia,malaysian', 'Malaysia', 'MY'],
  ['philippines,philippine,filipino', 'Philippines', 'PH'],
  ['india,indian', 'India', 'IN'],
  ['saudi arabia,saudi', 'Saudi Arabia', 'SA'],
  ['uae,united arab emirates,emirati', 'UAE', 'AE'],
  ['brazil,brazilian', 'Brazil', 'BR'],
  ['russia,russian', 'Russia', 'RU'],
  ['turkey,turkish', 'Turkey', 'TR'],
  ['mexico,mexican', 'Mexico', 'MX'],
  ['singapore,singaporean', 'Singapore', 'SG'],
  ['taiwan,taiwanese', 'Taiwan', 'TW'],
  ['hong kong', 'Hong Kong', 'HK'],
  ['cambodia,cambodian', 'Cambodia', 'KH'],
  ['myanmar', 'Myanmar', 'MM'],
  ['nigeria,nigerian', 'Nigeria', 'NG'],
  ['south africa', 'South Africa', 'ZA'],
  ['kenya,kenyan', 'Kenya', 'KE'],
  ['ghana,ghanaian', 'Ghana', 'GH'],
  ['morocco,moroccan', 'Morocco', 'MA'],
  ['algeria,algerian', 'Algeria', 'DZ'],
  ['iraq,iraqi', 'Iraq', 'IQ'],
  ['iran,iranian', 'Iran', 'IR'],
  ['pakistan,pakistani', 'Pakistan', 'PK'],
  ['bangladesh,bangladeshi', 'Bangladesh', 'BD'],
  ['jordan,jordanian', 'Jordan', 'JO'],
  ['lebanon,lebanese', 'Lebanon', 'LB'],
  ['kuwait,kuwaiti', 'Kuwait', 'KW'],
  ['qatar,qatari', 'Qatar', 'QA'],
  ['oman,omani', 'Oman', 'OM'],
  ['bahrain,bahraini', 'Bahrain', 'BH'],
  ['australia,australian', 'Australia', 'AU'],
  ['canada,canadian', 'Canada', 'CA'],
  ['colombia,colombian', 'Colombia', 'CO'],
  ['chile,chilean', 'Chile', 'CL'],
  ['peru,peruvian', 'Peru', 'PE'],
  ['argentina,argentine', 'Argentina', 'AR'],
  ['uzbekistan', 'Uzbekistan', 'UZ'],
  ['kazakhstan', 'Kazakhstan', 'KZ'],
  ['mongolia,mongolian', 'Mongolia', 'MN'],
  ['new zealand', 'New Zealand', 'NZ'],
  ['united states,usa,american', 'USA', 'US'],
  ['european union,eu,european', 'EU', 'EU'],
];

const COUNTRY_KEYWORDS = {};
for (const [keywords, name, code] of COUNTRY_DATA) {
  for (const kw of keywords.split(',')) {
    COUNTRY_KEYWORDS[kw.trim()] = { name, code };
  }
}

function detectCountryFromText(text) {
  const lower = text.toLowerCase();
  const sorted = Object.entries(COUNTRY_KEYWORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [keyword, info] of sorted) {
    const regex = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (regex.test(lower)) return info;
  }
  return null;
}

function parseCountryText(text) {
  const results = [];
  const blocks = text.split(/\n\s*[-–—=]{3,}\s*\n/).filter(b => b.trim());

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const hasExplicitHeaders = lines.some(line =>
      /^[*\-–—•#\d.)]*\s*.+?\s*[\(\[]\s*[A-Za-z]{2,3}\s*[\)\]]/.test(line) ||
      /^[*\-–—•]*\s*[A-Z]{2,3}\s*[-–—:]\s*.+/.test(line)
    );

    if (hasExplicitHeaders) {
      let current = null;
      let section = 'auto';
      for (const line of lines) {
        const m1 = line.match(/^[*\-–—•#\d.)]*\s*(.+?)\s*[\(\[]\s*([A-Za-z]{2,3})\s*[\)\]]?\s*:?\s*$/);
        const m2 = !m1 ? line.match(/^[*\-–—•]*\s*([A-Z]{2,3})\s*[-–—:]\s*(.+?)\s*$/) : null;
        if (m1) {
          if (current) results.push({ name: current.name, code: current.code, requirements: current.requirements.join('\n'), documents: current.documents.join(', '), selected: true });
          current = { name: m1[1].trim(), code: m1[2].toUpperCase(), requirements: [], documents: [] };
          section = 'auto';
        } else if (m2) {
          if (current) results.push({ name: current.name, code: current.code, requirements: current.requirements.join('\n'), documents: current.documents.join(', '), selected: true });
          current = { name: m2[2].trim(), code: m2[1].toUpperCase(), requirements: [], documents: [] };
          section = 'auto';
        } else if (current) {
          const clean = line.replace(/^[*\-–—•]\s*/, '').trim();
          if (!clean) continue;
          if (/^(requirements?|규정|요건|수출\s*요건)\s*[:：]?\s*$/i.test(clean)) { section = 'requirements'; continue; }
          if (/^(documents?|서류|필요\s*서류)\s*[:：]?\s*$/i.test(clean)) { section = 'documents'; continue; }
          if (/^(requirements?|규정|요건|수출\s*요건)\s*[:：]\s*(.+)/i.test(clean)) {
            current.requirements.push(clean.replace(/^.+?[:：]\s*/, '').trim());
            section = 'requirements'; continue;
          }
          if (/^(documents?|서류|필요\s*서류)\s*[:：]\s*(.+)/i.test(clean)) {
            clean.replace(/^.+?[:：]\s*/, '').split(',').map(s => s.trim()).filter(Boolean).forEach(d => current.documents.push(d));
            section = 'documents'; continue;
          }
          if (section === 'requirements') { current.requirements.push(clean); }
          else if (section === 'documents') { current.documents.push(clean); }
          else {
            if (/^[*\-–—•]/.test(line)) current.documents.push(clean);
            else current.requirements.push(clean);
          }
        }
      }
      if (current) results.push({ name: current.name, code: current.code, requirements: current.requirements.join('\n'), documents: current.documents.join(', '), selected: true });
    } else {
      const detected = detectCountryFromText(block);
      if (!detected) continue;
      const requirements = [];
      const documents = [];
      for (const line of lines) {
        const clean = line.replace(/^[*\-–—•]\s*/, '').trim();
        if (!clean) continue;
        if (/^(requirements?|documents?|규정|요건|서류|필요\s*서류)\s*[:：]?\s*$/i.test(clean)) continue;
        if (/^(documents?|서류|필요\s*서류)\s*[:：]\s*(.+)/i.test(clean)) {
          clean.replace(/^.+?[:：]\s*/, '').split(',').map(s => s.trim()).filter(Boolean).forEach(d => documents.push(d));
          continue;
        }
        if (/^(requirements?|규정|요건|수출\s*요건)\s*[:：]\s*(.+)/i.test(clean)) {
          requirements.push(clean.replace(/^.+?[:：]\s*/, '').trim());
          continue;
        }
        if (/^[*\-–—•]/.test(line)) documents.push(clean);
        else requirements.push(clean);
      }
      results.push({ name: detected.name, code: detected.code, requirements: requirements.join('\n'), documents: documents.join(', '), selected: true });
    }
  }
  return results;
}

// 국가 선택 드롭다운 컴포넌트
function CountryDropdown({ countries, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selectedCodes = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  const allSelected = countries.length > 0 && selectedCodes.length === countries.length;

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggle(code) {
    const next = selectedCodes.includes(code)
      ? selectedCodes.filter(c => c !== code)
      : [...selectedCodes, code];
    onChange(next.join(', '));
  }

  function toggleAll() {
    onChange(allSelected ? '' : countries.map(c => c.code).join(', '));
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 text-sm text-left flex justify-between items-center hover:border-border-light focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      >
        <span className={selectedCodes.length ? 'text-gray-100' : 'text-gray-400'}>
          {selectedCodes.length === 0
            ? '국가를 선택하세요'
            : allSelected
              ? `전체 선택 (${countries.length}개)`
              : `${selectedCodes.length}개 국가 선택됨 (${selectedCodes.join(', ')})`}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <label className="flex items-center gap-2 px-3 py-2 hover:bg-surface-light cursor-pointer border-b border-border font-medium text-sm text-primary">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded" />
            전체 선택
          </label>
          {countries.map(c => (
            <label key={c.id || c.code} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-light cursor-pointer text-sm">
              <input type="checkbox" checked={selectedCodes.includes(c.code)} onChange={() => toggle(c.code)} className="h-4 w-4 rounded" />
              <span className="bg-surface-light text-gray-400 text-xs px-1.5 py-0.5 rounded font-mono">{c.code}</span>
              <span className="text-gray-300">{c.name}</span>
            </label>
          ))}
          {countries.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-400">등록된 국가가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [countries, setCountries] = useState([]);
  const [form, setForm] = useState(emptyProduct);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // 제품 일괄 등록
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [parsedProducts, setParsedProducts] = useState([]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // 일괄 삭제
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // 국가 관리
  const [showCountryMgmt, setShowCountryMgmt] = useState(false);
  const [countryForm, setCountryForm] = useState(emptyCountry);
  const [countryEditingId, setCountryEditingId] = useState(null);
  const [showCountryForm, setShowCountryForm] = useState(false);
  const [showCountryBulk, setShowCountryBulk] = useState(false);
  const [countryBulkText, setCountryBulkText] = useState('');
  const [parsedCountries, setParsedCountries] = useState([]);
  const [countryBulkSaving, setCountryBulkSaving] = useState(false);

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map(p => p.id)));
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}개 제품을 삭제하시겠습니까?`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selectedIds) {
        await deleteDoc(doc(db, 'products', id));
      }
      setSelectedIds(new Set());
      fetchData();
    } catch (error) {
      console.error('일괄 삭제 실패:', error);
      alert('일부 제품 삭제 중 오류가 발생했습니다.');
    }
    setBulkDeleting(false);
  }

  async function fetchData() {
    try {
      const [productsSnap, countriesSnap] = await Promise.all([
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'countries'))
      ]);
      setProducts(productsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCountries(countriesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error('데이터 로딩 실패:', error);
    }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  // --- 제품 관련 ---

  function handleParse() {
    const results = parseEmailText(bulkText);
    if (results.length === 0) {
      alert('파싱된 제품이 없습니다. 텍스트 형식을 확인해주세요.\n\n예시:\n* Serums & Body Oils (6 SKUs)\nNiacinamide, Hyaluronic Acid, Vitamin C');
      return;
    }
    setParsedProducts(results);
  }

  function updateParsedProduct(index, field, value) {
    setParsedProducts(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  }

  function toggleParsedProduct(index) {
    setParsedProducts(prev => prev.map((p, i) => i === index ? { ...p, selected: !p.selected } : p));
  }

  function removeParsedProduct(index) {
    setParsedProducts(prev => prev.filter((_, i) => i !== index));
  }

  async function handleBulkSave() {
    const toSave = parsedProducts.filter(p => p.selected);
    if (toSave.length === 0) {
      alert('저장할 제품을 선택해주세요.');
      return;
    }
    setBulkSaving(true);
    let saved = 0;
    try {
      for (const p of toSave) {
        await addDoc(collection(db, 'products'), {
          name: p.name,
          category: p.category,
          ingredients: p.ingredients.split(',').map(s => s.trim()).filter(Boolean),
          functions: p.functions.split(',').map(s => s.trim()).filter(Boolean),
          targetCountries: p.targetCountries.split(',').map(s => s.trim()).filter(Boolean),
          requiredDocuments: p.requiredDocuments.split(',').map(s => s.trim()).filter(Boolean),
          description: p.description,
          createdAt: serverTimestamp()
        });
        saved++;
      }
      alert(`${saved}개 제품이 등록되었습니다.`);
      setParsedProducts([]);
      setBulkText('');
      setShowBulkImport(false);
      fetchData();
    } catch (error) {
      console.error('일괄 저장 실패:', error);
      alert(`${saved}개 저장 완료, 일부 오류 발생.`);
    }
    setBulkSaving(false);
  }

  function handleEdit(product) {
    setForm({
      name: product.name,
      category: product.category,
      ingredients: (product.ingredients || []).join(', '),
      functions: (product.functions || []).join(', '),
      targetCountries: (product.targetCountries || []).join(', '),
      requiredDocuments: (product.requiredDocuments || []).join(', '),
      description: product.description || ''
    });
    setEditingId(product.id);
    setShowForm(true);
    setShowBulkImport(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.category) {
      alert('제품명과 카테고리는 필수입니다.');
      return;
    }
    const data = {
      name: form.name,
      category: form.category,
      ingredients: form.ingredients.split(',').map(s => s.trim()).filter(Boolean),
      functions: form.functions.split(',').map(s => s.trim()).filter(Boolean),
      targetCountries: form.targetCountries.split(',').map(s => s.trim()).filter(Boolean),
      requiredDocuments: form.requiredDocuments.split(',').map(s => s.trim()).filter(Boolean),
      description: form.description
    };
    try {
      if (editingId) {
        await updateDoc(doc(db, 'products', editingId), data);
      } else {
        await addDoc(collection(db, 'products'), { ...data, createdAt: serverTimestamp() });
      }
      setForm(emptyProduct);
      setEditingId(null);
      setShowForm(false);
      fetchData();
    } catch (error) {
      console.error('저장 실패:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  }

  async function handleDelete(id) {
    if (!confirm('이 제품을 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'products', id));
      fetchData();
    } catch (error) {
      console.error('삭제 실패:', error);
    }
  }

  // --- 국가 관련 ---

  function handleCountryEdit(country) {
    setCountryForm({
      name: country.name,
      code: country.code,
      requirements: country.requirements || '',
      documents: (country.documents || []).join(', ')
    });
    setCountryEditingId(country.id);
    setShowCountryForm(true);
    setShowCountryBulk(false);
  }

  async function handleCountrySubmit(e) {
    e.preventDefault();
    if (!countryForm.name || !countryForm.code) {
      alert('국가명과 국가코드는 필수입니다.');
      return;
    }
    const data = {
      name: countryForm.name,
      code: countryForm.code.toUpperCase(),
      requirements: countryForm.requirements,
      documents: countryForm.documents.split(',').map(s => s.trim()).filter(Boolean)
    };
    try {
      if (countryEditingId) {
        await updateDoc(doc(db, 'countries', countryEditingId), data);
      } else {
        await addDoc(collection(db, 'countries'), { ...data, createdAt: serverTimestamp() });
      }
      setCountryForm(emptyCountry);
      setCountryEditingId(null);
      setShowCountryForm(false);
      fetchData();
    } catch (error) {
      console.error('저장 실패:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  }

  async function handleCountryDelete(id) {
    if (!confirm('이 국가를 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'countries', id));
      fetchData();
    } catch (error) {
      console.error('삭제 실패:', error);
    }
  }

  function handleCountryParse() {
    const results = parseCountryText(countryBulkText);
    if (results.length === 0) {
      alert('파싱된 국가가 없습니다. 텍스트 형식을 확인해주세요.\n\n예시:\nEgypt (EG)\n- EDA Registration\n- Lab Testing Report');
      return;
    }
    setParsedCountries(results);
  }

  function updateParsedCountry(index, field, value) {
    setParsedCountries(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  }

  function toggleParsedCountry(index) {
    setParsedCountries(prev => prev.map((c, i) => i === index ? { ...c, selected: !c.selected } : c));
  }

  function removeParsedCountry(index) {
    setParsedCountries(prev => prev.filter((_, i) => i !== index));
  }

  async function handleCountryBulkSave() {
    const toSave = parsedCountries.filter(c => c.selected);
    if (toSave.length === 0) {
      alert('저장할 국가를 선택해주세요.');
      return;
    }
    setCountryBulkSaving(true);
    let saved = 0;
    try {
      for (const c of toSave) {
        await addDoc(collection(db, 'countries'), {
          name: c.name,
          code: c.code.toUpperCase(),
          requirements: c.requirements,
          documents: c.documents.split(',').map(s => s.trim()).filter(Boolean),
          createdAt: serverTimestamp()
        });
        saved++;
      }
      alert(`${saved}개 국가가 등록되었습니다.`);
      setParsedCountries([]);
      setCountryBulkText('');
      setShowCountryBulk(false);
      fetchData();
    } catch (error) {
      console.error('일괄 저장 실패:', error);
      alert(`${saved}개 저장 완료, 일부 오류 발생.`);
    }
    setCountryBulkSaving(false);
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
        <h1 className="text-2xl font-bold text-gray-100">제품 관리</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowCountryMgmt(!showCountryMgmt); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              showCountryMgmt
                ? 'bg-gray-700 text-white'
                : 'bg-surface-light text-gray-400 hover:bg-border'
            }`}
          >
            {showCountryMgmt ? '국가 관리 닫기' : '국가 관리'}
          </button>
          <button
            onClick={() => { setShowBulkImport(!showBulkImport); setShowForm(false); setParsedProducts([]); }}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition"
          >
            {showBulkImport ? '취소' : '텍스트로 일괄 등록'}
          </button>
          <button
            onClick={() => { setForm(emptyProduct); setEditingId(null); setShowForm(!showForm); setShowBulkImport(false); }}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition"
          >
            {showForm ? '취소' : '+ 개별 추가'}
          </button>
        </div>
      </div>

      {/* 국가 관리 섹션 */}
      {showCountryMgmt && (
        <div className="bg-surface rounded-xl p-6 border border-border mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-200">국가 관리</h2>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowCountryBulk(!showCountryBulk); setShowCountryForm(false); setParsedCountries([]); }}
                className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 transition"
              >
                {showCountryBulk ? '취소' : '텍스트로 국가 등록'}
              </button>
              <button
                onClick={() => { setCountryForm(emptyCountry); setCountryEditingId(null); setShowCountryForm(!showCountryForm); setShowCountryBulk(false); }}
                className="bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary-dark transition"
              >
                {showCountryForm ? '취소' : '+ 국가 추가'}
              </button>
            </div>
          </div>

          {/* 국가 텍스트 일괄 등록 */}
          {showCountryBulk && (
            <div className="space-y-4 mb-4 p-4 bg-surface-dark rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">국가별 수출 요건 텍스트</label>
                <p className="text-xs text-gray-400 mb-2">
                  바이어 메일 텍스트를 그대로 붙여넣으세요. 국가명이 본문에 포함되어 있으면 자동 감지합니다.
                </p>
                <textarea
                  value={countryBulkText}
                  onChange={e => setCountryBulkText(e.target.value)}
                  rows={8}
                  className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder={`예시:\nEgypt (EG)\n- EDA Registration\n- Lab Testing Report\n\n----------\n\nVietnam (VN)\n- Product Registration with DAV`}
                />
              </div>
              <button
                onClick={handleCountryParse}
                disabled={!countryBulkText.trim()}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
              >
                텍스트 분석하기
              </button>

              {parsedCountries.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-200">
                      분석 결과: {parsedCountries.length}개 국가
                      <span className="text-xs font-normal text-gray-400 ml-2">
                        ({parsedCountries.filter(c => c.selected).length}개 선택됨)
                      </span>
                    </h3>
                    <div className="flex gap-2">
                      <button onClick={() => setParsedCountries(prev => prev.map(c => ({ ...c, selected: true })))} className="text-primary text-xs hover:underline">전체 선택</button>
                      <button onClick={() => setParsedCountries(prev => prev.map(c => ({ ...c, selected: false })))} className="text-gray-400 text-xs hover:underline">전체 해제</button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {parsedCountries.map((c, i) => (
                      <div key={i} className={`rounded-lg p-3 border transition ${c.selected ? 'border-green-300 bg-green-500/15' : 'border-border bg-surface opacity-60'}`}>
                        <div className="flex items-start gap-2">
                          <input type="checkbox" checked={c.selected} onChange={() => toggleParsedCountry(i)} className="mt-1 h-4 w-4" />
                          <div className="flex-1 space-y-1">
                            <div className="grid grid-cols-2 gap-2">
                              <input type="text" value={c.name} onChange={e => updateParsedCountry(i, 'name', e.target.value)} className="bg-surface-dark border border-border-light rounded px-2 py-1 text-gray-100 placeholder-gray-500 text-sm" placeholder="국가명" />
                              <input type="text" value={c.code} onChange={e => updateParsedCountry(i, 'code', e.target.value)} className="bg-surface-dark border border-border-light rounded px-2 py-1 text-gray-100 placeholder-gray-500 text-sm" placeholder="코드" maxLength={3} />
                            </div>
                            <textarea value={c.requirements} onChange={e => updateParsedCountry(i, 'requirements', e.target.value)} rows={2} className="w-full bg-surface-dark border border-border-light rounded px-2 py-1 text-gray-100 placeholder-gray-500 text-sm" placeholder="수출 요건" />
                            <input type="text" value={c.documents} onChange={e => updateParsedCountry(i, 'documents', e.target.value)} className="w-full bg-surface-dark border border-border-light rounded px-2 py-1 text-gray-100 placeholder-gray-500 text-sm" placeholder="필요 서류 (쉼표 구분)" />
                          </div>
                          <button onClick={() => removeParsedCountry(i)} className="text-red-400 hover:text-red-600">&times;</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleCountryBulkSave}
                    disabled={countryBulkSaving || parsedCountries.filter(c => c.selected).length === 0}
                    className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
                  >
                    {countryBulkSaving ? '저장 중...' : `선택한 ${parsedCountries.filter(c => c.selected).length}개 국가 일괄 등록`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 국가 개별 추가/수정 폼 */}
          {showCountryForm && (
            <form onSubmit={handleCountrySubmit} className="space-y-3 mb-4 p-4 bg-surface-dark rounded-lg">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">국가명 *</label>
                  <input
                    type="text"
                    value={countryForm.name}
                    onChange={e => setCountryForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Egypt"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">국가코드 *</label>
                  <input
                    type="text"
                    value={countryForm.code}
                    onChange={e => setCountryForm(prev => ({ ...prev, code: e.target.value }))}
                    className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="EG"
                    maxLength={3}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">수출 요건/규정</label>
                <textarea
                  value={countryForm.requirements}
                  onChange={e => setCountryForm(prev => ({ ...prev, requirements: e.target.value }))}
                  rows={3}
                  className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="수출 요건 및 규정"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">필요 서류 (쉼표로 구분)</label>
                <input
                  type="text"
                  value={countryForm.documents}
                  onChange={e => setCountryForm(prev => ({ ...prev, documents: e.target.value }))}
                  className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="위생허가서, 성분분석서, MSDS"
                />
              </div>
              <button type="submit" className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition">
                {countryEditingId ? '수정 저장' : '국가 추가'}
              </button>
            </form>
          )}

          {/* 등록된 국가 목록 */}
          {countries.length === 0 ? (
            <p className="text-gray-400 text-center py-4 text-sm">등록된 국가가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {countries.map(country => (
                <div key={country.id} className="bg-surface-dark rounded-lg p-3 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-primary-light text-primary text-xs font-medium px-2 py-0.5 rounded-full">{country.code}</span>
                      <span className="font-medium text-gray-100 text-sm">{country.name}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleCountryEdit(country)} className="text-primary hover:underline text-xs">수정</button>
                      <button onClick={() => handleCountryDelete(country.id)} className="text-red-500 hover:underline text-xs">삭제</button>
                    </div>
                  </div>
                  {country.requirements && (
                    <p className="text-xs text-gray-400 mb-1 whitespace-pre-line line-clamp-2">{country.requirements}</p>
                  )}
                  {country.documents && country.documents.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {country.documents.map((d, i) => (
                        <span key={i} className="bg-surface-light text-gray-400 text-xs px-1.5 py-0.5 rounded">{d}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 텍스트 일괄 등록 */}
      {showBulkImport && (
        <div className="bg-surface rounded-xl p-6 border border-border mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              바이어 메일 또는 제품 목록 텍스트를 붙여넣기 하세요
            </label>
            <p className="text-xs text-gray-400 mb-2">
              형식: * 카테고리명 (N SKUs) 다음 줄에 성분 목록. 줄바꿈으로 구분합니다.
            </p>
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              rows={12}
              className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder={`예시:\n* Serums & Body Oils (6 SKUs)\nNiacinamide, Hyaluronic Acid, Vitamin C, Peptides, Botanical Oils\n\n* Moisturizers – Face & Body (6 SKUs)\nCeramides, Shea Butter, Squalane, Hyaluronic Acid\n\n* Cleansers (6 SKUs)\nAmino Acid Cleansing System, Centella, Aloe Vera, Panthenol`}
            />
          </div>
          <button
            onClick={handleParse}
            disabled={!bulkText.trim()}
            className="bg-green-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
          >
            텍스트 분석하기
          </button>

          {/* 파싱 결과 미리보기 */}
          {parsedProducts.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-200">
                  분석 결과: {parsedProducts.length}개 제품
                  <span className="text-sm font-normal text-gray-400 ml-2">
                    ({parsedProducts.filter(p => p.selected).length}개 선택됨)
                  </span>
                </h3>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setParsedProducts(prev => prev.map(p => ({ ...p, selected: true })))}
                    className="text-primary text-xs hover:underline"
                  >
                    전체 선택
                  </button>
                  <button
                    onClick={() => setParsedProducts(prev => prev.map(p => ({ ...p, selected: false })))}
                    className="text-gray-400 text-xs hover:underline"
                  >
                    전체 해제
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {parsedProducts.map((p, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-4 border transition ${
                      p.selected ? 'border-green-300 bg-green-500/15' : 'border-border bg-surface-dark opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={p.selected}
                        onChange={() => toggleParsedProduct(i)}
                        className="mt-1 h-4 w-4"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-400">제품명</label>
                            <input type="text" value={p.name} onChange={e => updateParsedProduct(i, 'name', e.target.value)} className="w-full bg-surface-dark border border-border-light rounded px-2 py-1.5 text-gray-100 placeholder-gray-500 text-sm" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400">카테고리</label>
                            <input type="text" value={p.category} onChange={e => updateParsedProduct(i, 'category', e.target.value)} className="w-full bg-surface-dark border border-border-light rounded px-2 py-1.5 text-gray-100 placeholder-gray-500 text-sm" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400">대상 국가</label>
                          <CountryDropdown
                            countries={countries}
                            value={p.targetCountries || ''}
                            onChange={val => updateParsedProduct(i, 'targetCountries', val)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400">성분</label>
                          <input type="text" value={p.ingredients} onChange={e => updateParsedProduct(i, 'ingredients', e.target.value)} className="w-full bg-surface-dark border border-border-light rounded px-2 py-1.5 text-gray-100 placeholder-gray-500 text-sm" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-400">기능</label>
                            <input type="text" value={p.functions} onChange={e => updateParsedProduct(i, 'functions', e.target.value)} className="w-full bg-surface-dark border border-border-light rounded px-2 py-1.5 text-gray-100 placeholder-gray-500 text-sm" placeholder="기능 입력" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400">필요 서류</label>
                            <input type="text" value={p.requiredDocuments} onChange={e => updateParsedProduct(i, 'requiredDocuments', e.target.value)} className="w-full bg-surface-dark border border-border-light rounded px-2 py-1.5 text-gray-100 placeholder-gray-500 text-sm" placeholder="EDA Registration, Lab Testing" />
                          </div>
                        </div>
                      </div>
                      <button onClick={() => removeParsedProduct(i)} className="text-red-400 hover:text-red-600 text-lg" title="삭제">&times;</button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleBulkSave}
                disabled={bulkSaving || parsedProducts.filter(p => p.selected).length === 0}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
              >
                {bulkSaving
                  ? '저장 중...'
                  : `선택한 ${parsedProducts.filter(p => p.selected).length}개 제품 일괄 등록`
                }
              </button>
            </div>
          )}
        </div>
      )}

      {/* 개별 제품 추가/수정 폼 */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-xl p-6 border border-border mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">제품명 *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Hyaluronic Acid Serum"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">카테고리 *</label>
              <input
                type="text"
                value={form.category}
                onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Serums & Body Oils"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">주요 성분 (쉼표로 구분)</label>
            <input
              type="text"
              value={form.ingredients}
              onChange={e => setForm(prev => ({ ...prev, ingredients: e.target.value }))}
              className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Niacinamide, Hyaluronic Acid"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">기능 (쉼표로 구분)</label>
            <input
              type="text"
              value={form.functions}
              onChange={e => setForm(prev => ({ ...prev, functions: e.target.value }))}
              className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Brightening, Moisturizing"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">대상 국가</label>
            <CountryDropdown
              countries={countries}
              value={form.targetCountries}
              onChange={val => setForm(prev => ({ ...prev, targetCountries: val }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">필요 서류 (쉼표로 구분)</label>
            <input
              type="text"
              value={form.requiredDocuments}
              onChange={e => setForm(prev => ({ ...prev, requiredDocuments: e.target.value }))}
              className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="EDA Registration, Ingredient Compliance, Lab Testing Report"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">설명</label>
            <textarea
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full bg-surface-dark border border-border-light rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Product description"
            />
          </div>
          <button
            type="submit"
            className="bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-dark transition"
          >
            {editingId ? '수정 저장' : '제품 추가'}
          </button>
        </form>
      )}

      {/* 등록된 제품 목록 */}
      {products.length === 0 ? (
        <p className="text-gray-400 text-center py-8">등록된 제품이 없습니다.</p>
      ) : (
        <div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 mb-3 bg-red-500/15 px-4 py-2.5 rounded-lg">
              <span className="text-sm text-red-400 font-medium">{selectedIds.size}개 선택됨</span>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50"
              >
                {bulkDeleting ? '삭제 중...' : '선택 삭제'}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-gray-400 text-sm hover:underline"
              >
                선택 해제
              </button>
            </div>
          )}
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-dark">
                <tr>
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={products.length > 0 && selectedIds.size === products.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="text-left px-3 py-3 font-medium text-gray-400 w-12">No.</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">제품명</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">카테고리</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">성분</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">대상 국가</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((product, index) => (
                  <tr key={product.id} className={`hover:bg-surface-light ${selectedIds.has(product.id) ? 'bg-purple-500/15' : ''}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={() => toggleSelect(product.id)}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-3 py-3 text-gray-400 font-mono text-xs">{index + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-100">{product.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-purple-500/15 text-purple-300 text-xs px-2 py-0.5 rounded">
                        {product.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{(product.ingredients || []).join(', ')}</td>
                    <td className="px-4 py-3 text-gray-400">{(product.targetCountries || []).join(', ')}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleEdit(product)}
                        className="text-primary hover:underline mr-3 text-xs"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
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
        </div>
      )}
    </div>
  );
}
