import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [countries, setCountries] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [expandedCountry, setExpandedCountry] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [productsSnap, countriesSnap] = await Promise.all([
          getDocs(collection(db, 'products')),
          getDocs(collection(db, 'countries'))
        ]);
        setProducts(productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setCountries(countriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error('데이터 로딩 실패:', error);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const categories = ['전체', ...new Set(products.map(p => p.category))];
  const filteredProducts = selectedCategory === '전체'
    ? products
    : products.filter(p => p.category === selectedCategory);

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

  return (
    <div className="space-y-8">
      <div className="text-center py-8">
        <h1 className="text-3xl font-bold text-gray-100 mb-2">화장품 수출 정보</h1>
        <p className="text-gray-400">국가별 수출 요건과 제품 정보를 확인하세요</p>
      </div>

      <section>
        <h2 className="text-xl font-semibold text-gray-200 mb-4">국가별 수출 요구 서류</h2>
        {countryInfo.length === 0 ? (
          <p className="text-gray-500 text-center py-8">등록된 국가 정보가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {countryInfo.map(country => (
              <div
                key={country.code}
                onClick={() => setExpandedCountry(expandedCountry === country.code ? null : country.code)}
                className={`bg-surface rounded-xl p-5 border cursor-pointer transition-all ${
                  expandedCountry === country.code
                    ? 'border-primary shadow-lg shadow-primary/10'
                    : 'border-border hover:border-border-light'
                }`}
              >
                <div className="flex items-center gap-3 mb-1">
                  <span className="bg-primary-light text-primary text-sm font-medium px-3 py-1 rounded-full">{country.code}</span>
                  {country.name && <span className="font-semibold text-gray-100">{country.name}</span>}
                  <span className="text-sm text-gray-500">{country.products.length}개 제품</span>
                </div>
                {expandedCountry === country.code && (
                  <div className="mt-3 space-y-3">
                    {country.requirements && (
                      <div>
                        <p className="text-sm text-gray-400 mb-1">수출 요건</p>
                        <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-dark rounded-lg p-3">{country.requirements}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-gray-400 mb-1">카테고리</p>
                      <div className="flex flex-wrap gap-1">
                        {[...country.categories].map((cat, i) => (
                          <span key={i} className="bg-purple-500/15 text-purple-300 text-xs px-2 py-0.5 rounded">{cat}</span>
                        ))}
                      </div>
                    </div>
                    {country.documents.size > 0 && (
                      <div>
                        <p className="text-sm text-gray-400 mb-1">필요 서류</p>
                        <div className="flex flex-wrap gap-1">
                          {[...country.documents].map((doc, i) => (
                            <span key={i} className="bg-orange-500/15 text-orange-300 text-xs px-2 py-0.5 rounded">{doc}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {country.products.length > 0 && (
                      <div>
                        <p className="text-sm text-gray-400 mb-1">대상 제품</p>
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
        <h2 className="text-xl font-semibold text-gray-200 mb-4">제품 목록</h2>
        <div className="flex gap-2 mb-4 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                selectedCategory === cat
                  ? 'bg-primary text-white'
                  : 'bg-surface text-gray-400 border border-border hover:border-border-light'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        {filteredProducts.length === 0 ? (
          <p className="text-gray-500 text-center py-8">등록된 제품이 없습니다.</p>
        ) : (
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-dark">
                <tr>
                  <th className="text-left px-3 py-3 font-medium text-gray-400 w-12">No.</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">제품명</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">카테고리</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">주요 성분</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">기능</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">대상 국가</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProducts.map((product, index) => (
                  <tr key={product.id} className="hover:bg-surface-light transition">
                    <td className="px-3 py-3 text-gray-500 font-mono text-xs">{index + 1}</td>
                    <td className="px-4 py-3"><span className="font-medium text-gray-100">{product.name}</span></td>
                    <td className="px-4 py-3">
                      <span className="bg-purple-500/15 text-purple-300 text-xs px-2 py-0.5 rounded">{product.category}</span>
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
        )}
      </section>

      <footer className="mt-12 pt-6 border-t border-border text-center text-xs text-gray-500 space-y-1 pb-4">
        <p>상호명: 히보스 | 대표자: 이주호</p>
        <p>사업자등록번호: 135-41-00648 | 통신판매업신고: 제 2020-인천서구-0504호</p>
        <p>주소: 인천시 서구 완정로 154 | 이메일: info@hibos.co.kr</p>
        <p className="text-gray-600 mt-2">&copy; 2026 HIBOS. All rights reserved.</p>
      </footer>
    </div>
  );
}
