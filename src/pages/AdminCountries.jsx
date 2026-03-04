import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const emptyCountry = { name: '', code: '', requirements: '', documents: '' };

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

// 텍스트 내에서 국가명/형용사 감지
function detectCountryFromText(text) {
  const lower = text.toLowerCase();
  const sorted = Object.entries(COUNTRY_KEYWORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [keyword, info] of sorted) {
    const regex = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (regex.test(lower)) return info;
  }
  return null;
}

// 텍스트에서 국가 정보 파싱
function parseCountryText(text) {
  const results = [];

  // 구분선(---, ===)으로 블록 분리
  const blocks = text.split(/\n\s*[-–—=]{3,}\s*\n/).filter(b => b.trim());

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // 명시적 헤더가 있는지 확인
    const hasExplicitHeaders = lines.some(line =>
      /^[*\-–—•#\d.)]*\s*.+?\s*[\(\[]\s*[A-Za-z]{2,3}\s*[\)\]]/.test(line) ||
      /^[*\-–—•]*\s*[A-Z]{2,3}\s*[-–—:]\s*.+/.test(line)
    );

    if (hasExplicitHeaders) {
      // 명시적 헤더 방식: 여러 국가 가능
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
            // auto: 불릿 → 서류, 일반 텍스트 → 요건
            if (/^[*\-–—•]/.test(line)) current.documents.push(clean);
            else current.requirements.push(clean);
          }
        }
      }
      if (current) results.push({ name: current.name, code: current.code, requirements: current.requirements.join('\n'), documents: current.documents.join(', '), selected: true });

    } else {
      // 키워드 감지 방식: 본문에서 국가명 추출
      const detected = detectCountryFromText(block);
      if (!detected) continue;

      const requirements = [];
      const documents = [];

      for (const line of lines) {
        const clean = line.replace(/^[*\-–—•]\s*/, '').trim();
        if (!clean) continue;

        // 섹션 헤더만 있는 줄 스킵
        if (/^(requirements?|documents?|규정|요건|서류|필요\s*서류)\s*[:：]?\s*$/i.test(clean)) continue;

        // "Documents: A, B, C" 인라인
        if (/^(documents?|서류|필요\s*서류)\s*[:：]\s*(.+)/i.test(clean)) {
          clean.replace(/^.+?[:：]\s*/, '').split(',').map(s => s.trim()).filter(Boolean).forEach(d => documents.push(d));
          continue;
        }
        // "Requirements: ..." 인라인
        if (/^(requirements?|규정|요건|수출\s*요건)\s*[:：]\s*(.+)/i.test(clean)) {
          requirements.push(clean.replace(/^.+?[:：]\s*/, '').trim());
          continue;
        }

        // 불릿 항목 → 필요 서류, 일반 텍스트 → 수출 요건
        if (/^[*\-–—•]/.test(line)) {
          documents.push(clean);
        } else {
          requirements.push(clean);
        }
      }

      results.push({
        name: detected.name,
        code: detected.code,
        requirements: requirements.join('\n'),
        documents: documents.join(', '),
        selected: true
      });
    }
  }

  return results;
}

export default function AdminCountries() {
  const [countries, setCountries] = useState([]);
  const [form, setForm] = useState(emptyCountry);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // 텍스트 일괄 등록
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [parsedCountries, setParsedCountries] = useState([]);
  const [bulkSaving, setBulkSaving] = useState(false);

  async function fetchCountries() {
    try {
      const snap = await getDocs(collection(db, 'countries'));
      setCountries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error('국가 로딩 실패:', error);
    }
    setLoading(false);
  }

  useEffect(() => { fetchCountries(); }, []);

  function handleEdit(country) {
    setForm({
      name: country.name,
      code: country.code,
      requirements: country.requirements || '',
      documents: (country.documents || []).join(', ')
    });
    setEditingId(country.id);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.code) {
      alert('국가명과 국가코드는 필수입니다.');
      return;
    }

    const data = {
      name: form.name,
      code: form.code.toUpperCase(),
      requirements: form.requirements,
      documents: form.documents.split(',').map(s => s.trim()).filter(Boolean)
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'countries', editingId), data);
      } else {
        await addDoc(collection(db, 'countries'), { ...data, createdAt: serverTimestamp() });
      }
      setForm(emptyCountry);
      setEditingId(null);
      setShowForm(false);
      fetchCountries();
    } catch (error) {
      console.error('저장 실패:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  }

  async function handleDelete(id) {
    if (!confirm('이 국가를 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'countries', id));
      fetchCountries();
    } catch (error) {
      console.error('삭제 실패:', error);
    }
  }

  // 텍스트 파싱
  function handleParse() {
    const results = parseCountryText(bulkText);
    if (results.length === 0) {
      alert('파싱된 국가가 없습니다. 텍스트 형식을 확인해주세요.\n\n예시:\nEgypt (EG)\n- EDA Registration\n- Lab Testing Report\n\nVietnam (VN)\n- Product Registration with DAV');
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

  async function handleBulkSave() {
    const toSave = parsedCountries.filter(c => c.selected);
    if (toSave.length === 0) {
      alert('저장할 국가를 선택해주세요.');
      return;
    }

    setBulkSaving(true);
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
      setBulkText('');
      setShowBulkImport(false);
      fetchCountries();
    } catch (error) {
      console.error('일괄 저장 실패:', error);
      alert(`${saved}개 저장 완료, 일부 오류 발생.`);
    }
    setBulkSaving(false);
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
        <h1 className="text-2xl font-bold text-gray-900">국가 관리</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowBulkImport(!showBulkImport); setShowForm(false); setParsedCountries([]); }}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition"
          >
            {showBulkImport ? '취소' : '텍스트로 일괄 등록'}
          </button>
          <button
            onClick={() => { setForm(emptyCountry); setEditingId(null); setShowForm(!showForm); setShowBulkImport(false); }}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition"
          >
            {showForm ? '취소' : '+ 개별 추가'}
          </button>
        </div>
      </div>

      {/* 텍스트 일괄 등록 */}
      {showBulkImport && (
        <div className="bg-white rounded-xl p-6 border border-gray-200 mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              국가별 수출 요건 텍스트를 붙여넣기 하세요
            </label>
            <p className="text-xs text-gray-400 mb-2">
              바이어 메일 텍스트를 그대로 붙여넣으세요. 국가명이 본문에 포함되어 있으면 자동 감지합니다. 여러 국가는 구분선(---)으로 나눠주세요.
            </p>
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              rows={12}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder={`예시 1 (바이어 메일 텍스트):\nAll cosmetic products must be registered with the Egyptian Drug Authority before commercialization.\n\nRequirements:\n* Ingredient compliance review\n* Claims approval\n* Factory registration\n\n----------\n\n예시 2 (명시적 헤더):\nVietnam (VN)\n- Product Registration with DAV\n- Free Sale Certificate\n- GMP Certificate`}
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
          {parsedCountries.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800">
                  분석 결과: {parsedCountries.length}개 국가
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    ({parsedCountries.filter(c => c.selected).length}개 선택됨)
                  </span>
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setParsedCountries(prev => prev.map(c => ({ ...c, selected: true })))}
                    className="text-primary text-xs hover:underline"
                  >
                    전체 선택
                  </button>
                  <button
                    onClick={() => setParsedCountries(prev => prev.map(c => ({ ...c, selected: false })))}
                    className="text-gray-500 text-xs hover:underline"
                  >
                    전체 해제
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {parsedCountries.map((c, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-4 border transition ${
                      c.selected ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={() => toggleParsedCountry(i)}
                        className="mt-1 h-4 w-4"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500">국가명</label>
                            <input
                              type="text"
                              value={c.name}
                              onChange={e => updateParsedCountry(i, 'name', e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500">국가코드</label>
                            <input
                              type="text"
                              value={c.code}
                              onChange={e => updateParsedCountry(i, 'code', e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                              maxLength={3}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500">수출 요건/규정</label>
                          <textarea
                            value={c.requirements}
                            onChange={e => updateParsedCountry(i, 'requirements', e.target.value)}
                            rows={2}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                            placeholder="수출 요건 및 규정"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500">필요 서류 (쉼표로 구분)</label>
                          <input
                            type="text"
                            value={c.documents}
                            onChange={e => updateParsedCountry(i, 'documents', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                            placeholder="서류1, 서류2, 서류3"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => removeParsedCountry(i)}
                        className="text-red-400 hover:text-red-600 text-lg"
                        title="삭제"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleBulkSave}
                disabled={bulkSaving || parsedCountries.filter(c => c.selected).length === 0}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
              >
                {bulkSaving
                  ? '저장 중...'
                  : `선택한 ${parsedCountries.filter(c => c.selected).length}개 국가 일괄 등록`
                }
              </button>
            </div>
          )}
        </div>
      )}

      {/* 개별 국가 추가/수정 폼 */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 border border-gray-200 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">국가명 *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="베트남"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">국가코드 *</label>
              <input
                type="text"
                value={form.code}
                onChange={e => setForm(prev => ({ ...prev, code: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="VN"
                maxLength={3}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">수출 요건/규정</label>
            <textarea
              value={form.requirements}
              onChange={e => setForm(prev => ({ ...prev, requirements: e.target.value }))}
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="해당 국가의 화장품 수출 시 필요한 요건 및 규정을 입력하세요"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">필요 서류 (쉼표로 구분)</label>
            <input
              type="text"
              value={form.documents}
              onChange={e => setForm(prev => ({ ...prev, documents: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="위생허가서, 성분분석서, MSDS"
            />
          </div>
          <button
            type="submit"
            className="bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-dark transition"
          >
            {editingId ? '수정 저장' : '국가 추가'}
          </button>
        </form>
      )}

      {countries.length === 0 ? (
        <p className="text-gray-400 text-center py-8">등록된 국가가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {countries.map(country => (
            <div key={country.id} className="bg-white rounded-xl p-5 border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="bg-primary-light text-primary text-sm font-medium px-3 py-1 rounded-full">
                    {country.code}
                  </span>
                  <h3 className="font-semibold text-gray-900">{country.name}</h3>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(country)} className="text-primary hover:underline text-xs">
                    수정
                  </button>
                  <button onClick={() => handleDelete(country.id)} className="text-red-500 hover:underline text-xs">
                    삭제
                  </button>
                </div>
              </div>
              {country.requirements && (
                <p className="text-sm text-gray-600 mb-2 whitespace-pre-line">{country.requirements}</p>
              )}
              {country.documents && country.documents.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {country.documents.map((doc, i) => (
                    <span key={i} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">
                      {doc}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
