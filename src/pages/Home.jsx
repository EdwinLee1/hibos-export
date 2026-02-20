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

  // countries 컬렉션 + products의 targetCountries 병합
  const countryInfo = useMemo(() => {
    const countryMap = {};

    // 1) countries 컬렉션에서 등록된 국가 정보 로드
    countries.forEach(c => {
      const upperCode = (c.code || '').toUpperCase();
      if (!upperCode) return;
      countryMap[upperCode] = {
        code: upperCode,
        name: c.name || '',
        requirements: c.requirements || '',
        documents: new Set((c.documents || []).filter(Boolean)),
        products: [],
        categories: new Set()
      };
    });

    // 2) products의 targetCountries에서 제품/카테고리/서류 정보 추가
    products.forEach(product => {
      (product.targetCountries || []).forEach(code => {
        if (!code) return;
        const upperCode = code.toUpperCase();
        if (!countryMap[upperCode]) {
          countryMap[upperCode] = {
            code: upperCode,
            name: '',
            requirements: '',
            documents: new Set(),
            products: [],
            categories: new Set()
          };
        }
        countryMap[upperCode].products.push(product.name);
        countryMap[upperCode].categories.add(product.category);
        (product.requiredDocuments || []).forEach(doc => {
          if (doc) countryMap[upperCode].documents.add(doc);
        });
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
      {/* 헤더 */}
      <div className="text-center py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">화장품 수출 정보</h1>
        <p className="text-gray-500">국가별 수출 요건과 제품 정보를 확인하세요</p>
      </div>

      {/* 국가별 수출 정보 - 제품에서 자동 추출 */}
      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">국가별 수출 정보</h2>
        {countryInfo.length === 0 ? (
          <p className="text-gray-400 text-center py-8">등록된 국가 정보가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {countryInfo.map(country => (
              <div
                key={country.code}
                onClick={() => setExpandedCountry(expandedCountry === country.code ? null : country.code)}
                className={`bg-white rounded-xl p-5 border cursor-pointer transition-all ${
                  expandedCountry === country.code
                    ? 'border-primary shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center gap-3 mb-1">
                  <span className="bg-primary-light text-primary text-sm font-medium px-3 py-1 rounded-full">
                    {country.code}
                  </span>
                  {country.name && (
                    <span className="font-semibold text-gray-900">{country.name}</span>
                  )}
                  <span className="text-sm text-gray-500">{country.products.length}개 제품</span>
                </div>
                {expandedCountry === country.code && (
                  <div className="mt-3 space-y-3">
                    {country.requirements && (
                      <div>
                        <p className="text-sm text-gray-500 mb-1">수출 요건</p>
                        <p className="text-sm text-gray-700 whitespace-pre-line bg-gray-50 rounded-lg p-3">
                          {country.requirements}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-gray-500 mb-1">카테고리</p>
                      <div className="flex flex-wrap gap-1">
                        {[...country.categories].map((cat, i) => (
                          <span key={i} className="bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded">
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>
                    {country.documents.size > 0 && (
                      <div>
                        <p className="text-sm text-gray-500 mb-1">필요 서류</p>
                        <div className="flex flex-wrap gap-1">
                          {[...country.documents].map((doc, i) => (
                            <span key={i} className="bg-orange-50 text-orange-600 text-xs px-2 py-0.5 rounded">
                              {doc}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {country.products.length > 0 && (
                      <div>
                        <p className="text-sm text-gray-500 mb-1">대상 제품</p>
                        <p className="text-xs text-gray-600">{country.products.join(', ')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 제품 목록 - 컴팩트 리스트형 */}
      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">제품 목록</h2>
        <div className="flex gap-2 mb-4 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                selectedCategory === cat
                  ? 'bg-primary text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        {filteredProducts.length === 0 ? (
          <p className="text-gray-400 text-center py-8">등록된 제품이 없습니다.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-3 font-medium text-gray-600 w-12">No.</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">제품명</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">카테고리</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">주요 성분</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">기능</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">대상 국가</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredProducts.map((product, index) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 text-gray-400 font-mono text-xs">{index + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{product.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded">
                        {product.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {(product.ingredients || []).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {(product.functions || []).join(', ')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(product.targetCountries || []).map((c, i) => (
                          <span key={i} className="bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded">
                            {c}
                          </span>
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
    </div>
  );
}
