{/* Voorraad tab */}
<div className="bg-white rounded-lg shadow p-6">
  <h2 className="text-lg font-bold mb-4">📦 Producten & Voorraad ({products.length})</h2>
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs divide-y">
      <thead>
        <tr className="bg-gray-50">
          <th className="p-3">ID</th>
          <th className="p-3">Naam</th>
          <th className="p-3">Prijs</th>
          <th className="p-3">Voorraad</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {products.map(product => (
          <>
            <tr key={product.id} className="hover:bg-gray-50 font-semibold">
              <td className="p-3">#{product.id}</td>
              <td className="p-3">{product.name} {product.type === 'variable' && <span className="text-[10px] bg-black text-white px-1.5 py-0.5 rounded ml-2">Variabel</span>}</td>
              <td className="p-3 text-red-600">€{parseFloat(product.price || 0).toFixed(2)}</td>
              <td className="p-3">
                {product.stock_quantity !== null && product.stock_quantity !== undefined 
                  ? <span className={`px-2 py-0.5 rounded text-white font-bold ${product.stock_quantity <= 0 ? 'bg-red-600' : 'bg-green-600'}`}>{product.stock_quantity}</span>
                  : 'N.v.t.'}
              </td>
            </tr>
            {/* Variaties onder het hoofdproduct tonen indien aanwezig */}
            {product.variations && product.variations.map(v => (
              <tr key={`var_${v.id}`} className="bg-gray-50 text-gray-600">
                <td className="p-3 pl-6">↳ #{v.id}</td>
                <td className="p-3 italic">
                  &nbsp;&nbsp;└ {v.attributes ? v.attributes.map(a => `${a.name}: ${a.option}`).join(', ') : 'Variatie'}
                </td>
                <td className="p-3">€{parseFloat(v.price || product.price || 0).toFixed(2)}</td>
                <td className="p-3">
                  {v.stock_quantity !== null && v.stock_quantity !== undefined 
                    ? <span className={`px-2 py-0.5 rounded text-white font-bold text-[10px] ${v.stock_quantity <= 0 ? 'bg-red-500' : 'bg-green-500'}`}>{v.stock_quantity}</span>
                    : 'N.v.t.'}
                </td>
              </tr>
            ))}
          </>
        ))}
      </tbody>
    </table>
  </div>
</div>