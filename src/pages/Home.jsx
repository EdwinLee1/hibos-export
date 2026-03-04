import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useLanguage } from '../contexts/LanguageContext';

export default function Home() {
  const { t, tc } = useLanguage();
  const [products, setProducts] = useState([]);
  const [countries, setCountries] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [expandedCountry, setExpandedCountry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ companies: 0, products: 0 });
  const [showNotice, setShowNotice] = useState(() => {
    const hideUntil = localStorage.getItem('hideNoticeUntil');
    if (hideUntil && new Date().toDateString() === new Date(hideUntil).toDateString()) return false;
    return true;
  });
  const [hideToday, setHideToday] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    async function fetchData() {
      try {
        const [productsSnap, countriesSnap, companiesSnap, cpSnap] = await Promise.all([
          getDocs(collection(db, 'products')),
          getDocs(collection(db, 'countries')),
          getDocs(collection(db, 'companies')),
          getDocs(collection(db, 'companyProducts'))
        ]);
        setProducts(productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setCountries(countriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setStats({ companies: companiesSnap.size, products: cpSnap.size });
      } catch (error) {
        console.error('데이터 로딩 실패:', error);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const rawCategories = [...new Set(products.map(p => p.category))];
  const filteredBase = selectedCategory == null
    ? products
    : products.filter(p => p.category === selectedCategory);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const filteredProducts = useMemo(() => {
    if (!sortKey) return filteredBase;
    return [...filteredBase].sort((a, b) => {
      let va, vb;
      if (sortKey === 'name') {
        va = a.name || '';
        vb = b.name || '';
      } else if (sortKey === 'category') {
        va = tc(a.category) || '';
        vb = tc(b.category) || '';
      } else if (sortKey === 'ingredients') {
        va = (a.ingredients || []).join(', ');
        vb = (b.ingredients || []).join(', ');
      } else {
        va = '';
        vb = '';
      }
      const cmp = va.localeCompare(vb, undefined, { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredBase, sortKey, sortDir]);

  const countryInfo = useMemo(() => {
    const countryMap = {};
    countries.forEach(c => {
      const upperCode = (c.code || '').toUpperCase();
      if (!upperCode) return;
      countryMap[upperCode] = {
        code: upperCode, name: c.name || '', requirements: c.requirements || '',
        documents: new Set((c.documents || []).filter(Boolean)), products: [], categories: new Set()
      };
    });
    products.forEach(product => {
      (product.targetCountries || []).forEach(code => {
        if (!code) return;
        const upperCode = code.toUpperCase();
        if (!countryMap[upperCode]) {
          countryMap[upperCode] = { code: upperCode, name: '', requirements: '', documents: new Set(), products: [], categories: new Set() };
        }
        countryMap[upperCode].products.push(product.name);
        countryMap[upperCode].categories.add(product.category);
        (product.requiredDocuments || []).forEach(doc => { if (doc) countryMap[upperCode].documents.add(doc); });
      });
    });
    return Object.values(countryMap).sort((a, b) => a.code.localeCompare(b.code));
  }, [products, countries]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  function closeNotice() {
    if (hideToday) {
      localStorage.setItem('hideNoticeUntil', new Date().toISOString());
    }
    setShowNotice(false);
  }

  return (
    <div className="space-y-8">
      {showNotice && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={closeNotice}>
          <div className="bg-surface rounded-2xl border border-border w-full max-w-lg overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">HIBOS Export Platform Update</h3>
              <button onClick={closeNotice} className="text-white/80 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-2 text-sm text-blue-300 font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                3/4일 바이어 미팅 후 플랫폼 업데이트 예정
              </div>
              <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
                <div className="flex gap-2">
                  <span className="text-blue-400 font-bold shrink-0">1.</span>
                  <p>문의 주신 업체들의 플랫폼 개선 사항을 반영.</p>
                </div>
                <div className="flex gap-2">
                  <span className="text-blue-400 font-bold shrink-0">2.</span>
                  <p>바이어 미팅 후 바이어 요청사항 제품, 카테고리 디테일 수정.</p>
                </div>
              </div>
              <div className="bg-surface-dark rounded-xl p-4 text-sm text-gray-400 leading-relaxed">
                <p className="text-cyan-400 font-medium mb-1">회사소개서, 납품 가능한 제품 리스트는</p>
                <p>
                  <span className="text-gray-500">e-mail : </span>
                  <a href="mailto:info@hibos.co.kr" className="text-blue-400 hover:underline font-medium">info@hibos.co.kr</a>
                  <span className="text-gray-500"> 로 부탁드립니다.</span>
                </p>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
                  <input type="checkbox" checked={hideToday} onChange={e => setHideToday(e.target.checked)}
                    className="rounded border-border accent-blue-500" />
                  금일 팝업창 닫기
                </label>
                <button onClick={closeNotice}
                  className="bg-primary text-white px-8 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-dark transition">
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="text-center py-6 sm:py-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-100 mb-2">{t('home.title')}</h1>
        <p className="text-gray-400 text-sm sm:text-base">{t('home.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-2xl border border-cyan-500/30 bg-surface p-6 sm:p-8 text-center shadow-[0_0_30px_rgba(6,182,212,0.15)]">
          <p className="text-cyan-400 text-xs sm:text-sm font-medium mb-1">{t('home.statsCompanies')}</p>
          <p className="text-4xl sm:text-5xl font-extrabold text-cyan-300 drop-shadow-[0_0_12px_rgba(6,182,212,0.6)]">{stats.companies}</p>
          <p className="text-gray-500 text-[10px] sm:text-xs mt-1">{t('home.statsCompaniesUnit')}</p>
        </div>
        <div className="rounded-2xl border border-lime-500/30 bg-surface p-6 sm:p-8 text-center shadow-[0_0_30px_rgba(132,204,22,0.15)]">
          <p className="text-lime-400 text-xs sm:text-sm font-medium mb-1">{t('home.statsProducts')}</p>
          <p className="text-4xl sm:text-5xl font-extrabold text-lime-300 drop-shadow-[0_0_12px_rgba(132,204,22,0.6)]">{stats.products}</p>
          <p className="text-gray-500 text-[10px] sm:text-xs mt-1">{t('home.statsProductsUnit')}</p>
        </div>
      </div>

      <section>
        <h2 className="text-lg sm:text-xl font-semibold text-gray-200 mb-4">{t('home.countrySection')}</h2>
        {countryInfo.length === 0 ? (
          <p className="text-gray-500 text-center py-8">{t('home.noCountries')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {countryInfo.map(country => (
              <div
                key={country.code}
                onClick={() => setExpandedCountry(expandedCountry === country.code ? null : country.code)}
                className={`bg-surface rounded-xl p-4 sm:p-5 border cursor-pointer transition-all ${
                  expandedCountry === country.code
                    ? 'border-primary shadow-lg shadow-primary/10'
                    : 'border-border hover:border-border-light'
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3 mb-1">
                  <span className="bg-primary-light text-primary text-sm font-medium px-3 py-1 rounded-full">{country.code}</span>
                  {country.name && <span className="font-semibold text-gray-100 text-sm sm:text-base">{country.name}</span>}
                  <span className="text-xs sm:text-sm text-gray-500">{country.products.length}{t('home.productsCount')}</span>
                  <svg className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${expandedCountry === country.code ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                {expandedCountry === country.code && (
                  <div className="mt-3 space-y-3">
                    {country.requirements && (
                      <div>
                        <p className="text-sm text-gray-400 mb-1">{t('home.exportReq')}</p>
                        <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-dark rounded-lg p-3">{country.requirements}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-gray-400 mb-1">{t('home.categories')}</p>
                      <div className="flex flex-wrap gap-1">
                        {[...country.categories].map((cat, i) => (
                          <span key={i} className="bg-purple-500/15 text-purple-300 text-xs px-2 py-0.5 rounded">{tc(cat)}</span>
                        ))}
                      </div>
                    </div>
                    {country.documents.size > 0 && (
                      <div>
                        <p className="text-sm text-gray-400 mb-1">{t('home.requiredDocs')}</p>
                        <div className="flex flex-wrap gap-1">
                          {[...country.documents].map((doc, i) => (
                            <span key={i} className="bg-orange-500/15 text-orange-300 text-xs px-2 py-0.5 rounded">{doc}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {country.products.length > 0 && (
                      <div>
                        <p className="text-sm text-gray-400 mb-1">{t('home.targetProducts')}</p>
                        <p className="text-xs text-gray-400">{country.products.join(', ')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg sm:text-xl font-semibold text-gray-200 mb-4">{t('home.productSection')}</h2>
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition ${
              selectedCategory == null
                ? 'bg-primary text-white'
                : 'bg-surface text-gray-400 border border-border hover:border-border-light'
            }`}
          >
            {t('common.all')}
          </button>
          {rawCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition ${
                selectedCategory === cat
                  ? 'bg-primary text-white'
                  : 'bg-surface text-gray-400 border border-border hover:border-border-light'
              }`}
            >
              {tc(cat)}
            </button>
          ))}
        </div>
        {filteredProducts.length === 0 ? (
          <p className="text-gray-500 text-center py-8">{t('home.noProducts')}</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-surface rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-dark">
                  <tr>
                    <th className="text-left px-3 py-3 font-medium text-gray-400 w-12">{t('home.thNo')}</th>
                    {['name', 'category', 'ingredients'].map(key => (
                      <th key={key}
                        onClick={() => handleSort(key)}
                        className="text-left px-4 py-3 font-medium text-gray-400 cursor-pointer hover:text-gray-200 select-none transition"
                      >
                        <span className="inline-flex items-center gap-1">
                          {t(key === 'name' ? 'home.thName' : key === 'category' ? 'home.thCategory' : 'home.thIngredients')}
                          {sortKey === key ? (
                            <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortDir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                          )}
                        </span>
                      </th>
                    ))}
                    <th className="text-left px-4 py-3 font-medium text-gray-400">{t('home.thFunctions')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-400">{t('home.thCountries')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredProducts.map((product, index) => (
                    <tr key={product.id} className="hover:bg-surface-light transition">
                      <td className="px-3 py-3 text-gray-500 font-mono text-xs">{index + 1}</td>
                      <td className="px-4 py-3"><span className="font-medium text-gray-100">{product.name}</span></td>
                      <td className="px-4 py-3">
                        <span className="bg-purple-500/15 text-purple-300 text-xs px-2 py-0.5 rounded">{tc(product.category)}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{(product.ingredients || []).join(', ')}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{(product.functions || []).join(', ')}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(product.targetCountries || []).map((c, i) => (
                            <span key={i} className="bg-surface-light text-gray-400 text-xs px-1.5 py-0.5 rounded">{c}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {filteredProducts.map((product, index) => (
                <div key={product.id} className="bg-surface rounded-xl p-4 border border-border">
                  <div className="flex items-start gap-3 mb-2">
                    <span className="text-gray-500 font-mono text-xs mt-0.5">{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-100 text-sm">{product.name}</h3>
                      <span className="inline-block bg-purple-500/15 text-purple-300 text-xs px-2 py-0.5 rounded mt-1">{tc(product.category)}</span>
                    </div>
                  </div>
                  {(product.ingredients || []).length > 0 && (
                    <p className="text-gray-400 text-xs mb-1">
                      <span className="text-gray-500">{t('home.thIngredients')}:</span> {product.ingredients.join(', ')}
                    </p>
                  )}
                  {(product.functions || []).length > 0 && (
                    <p className="text-gray-400 text-xs mb-2">
                      <span className="text-gray-500">{t('home.thFunctions')}:</span> {product.functions.join(', ')}
                    </p>
                  )}
                  {(product.targetCountries || []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {product.targetCountries.map((c, i) => (
                        <span key={i} className="bg-surface-light text-gray-400 text-xs px-1.5 py-0.5 rounded">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <footer className="mt-12 pt-5 border-t border-border text-xs text-gray-500 pb-4 text-center">
        <p>{t('home.footer.companyName')} | {t('home.footer.bizNumber')} | {t('home.footer.address')}</p>
        <p className="mt-1 text-gray-600">&copy; 2026 HIBOS. All rights reserved.</p>
      </footer>
    </div>
  );
}
